import { db, type WebhookEventRow } from "./db";
import { env } from "./env";
import { isBotPaused, SERVICE_WINDOW_MS } from "./inbox";
import { decideReply } from "./replies";
import {
  sendText,
  type WaContact,
  type WaMessage,
  type WaStatus,
  type WaWebhookPayload,
} from "./whatsapp";

const MAX_ATTEMPTS = 5;

/** Process a freshly stored event, unless someone else already claimed it. */
export async function processEventById(id: number): Promise<void> {
  const { data, error } = await db().rpc("claim_webhook_event", { p_id: id });
  if (error) throw new Error(`claim_webhook_event: ${error.message}`);
  for (const event of (data ?? []) as WebhookEventRow[]) await processEvent(event);
}

/**
 * Retry pending, failed and stuck events. Returns how many were processed.
 * Runs after every webhook and from the daily cron.
 */
export async function processBacklog(limit: number, includeDead = false): Promise<number> {
  const { data, error } = await db().rpc("claim_webhook_events", {
    p_limit: limit,
    p_include_dead: includeDead,
  });
  if (error) throw new Error(`claim_webhook_events: ${error.message}`);
  const events = (data ?? []) as WebhookEventRow[];
  for (const event of events) await processEvent(event);
  return events.length;
}

async function processEvent(event: WebhookEventRow): Promise<void> {
  try {
    await handlePayload(event.payload as WaWebhookPayload);
    await markEvent(event.id, { status: "done", processed_at: new Date().toISOString(), last_error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = event.attempts >= MAX_ATTEMPTS ? "dead" : "failed";
    // Log the error only, never the payload: it contains customer messages.
    console.error(`[webhook] event ${event.id} ${status} after attempt ${event.attempts}: ${message}`);
    await markEvent(event.id, { status, last_error: message.slice(0, 1000) });
  }
}

async function markEvent(id: number, fields: Record<string, unknown>): Promise<void> {
  const { error } = await db().from("webhook_events").update(fields).eq("id", id);
  // If this fails the event stays "processing" and is reclaimed after 5 minutes.
  if (error) console.error(`[webhook] could not update event ${id}: ${error.message}`);
}

async function handlePayload(payload: WaWebhookPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id ?? null;

      for (const contact of value.contacts ?? []) await upsertContact(contact);
      for (const message of value.messages ?? []) await handleIncomingMessage(message, phoneNumberId);
      // Statuses only update records; they never trigger a reply.
      for (const status of value.statuses ?? []) await handleStatus(status);

      if (value.errors?.length) console.warn(`[webhook] Meta reported ${value.errors.length} error(s) in a change`);
    }
  }
}

async function upsertContact(contact: WaContact): Promise<void> {
  const { error } = await db()
    .from("contacts")
    .upsert(
      { wa_id: contact.wa_id, profile_name: contact.profile?.name ?? null, updated_at: new Date().toISOString() },
      { onConflict: "wa_id" },
    );
  if (error) throw new Error(`upsert contact: ${error.message}`);
}

async function handleIncomingMessage(message: WaMessage, phoneNumberId: string | null): Promise<void> {
  const media = mediaOf(message);
  const { error } = await db()
    .from("messages")
    .upsert(
      {
        wa_message_id: message.id,
        direction: "in",
        wa_id: message.from,
        phone_number_id: phoneNumberId,
        type: message.type,
        body: bodyOf(message),
        media_id: media?.id ?? null,
        media_mime_type: media?.mime_type ?? null,
        payload: message,
        wa_timestamp: toIso(message.timestamp),
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`insert message: ${error.message}`);

  // Only reply for our own number, and only inside the service window.
  if (phoneNumberId !== env.phoneNumberId) return;
  if (Date.now() - Number(message.timestamp) * 1000 > SERVICE_WINDOW_MS) return;

  const reply = decideReply(message);
  // Staff have taken over this conversation: the bot stays quiet.
  if (reply && !(await isBotPaused(message.from))) await sendAutoReply(message, reply);
}

/**
 * Send at most one automatic reply per incoming message, even when Meta
 * redelivers the event or a retry overlaps with another worker.
 */
async function sendAutoReply(message: WaMessage, text: string): Promise<void> {
  const claim = await db()
    .from("messages")
    .update({ auto_reply_state: "sending" })
    .eq("wa_message_id", message.id)
    .is("auto_reply_state", null)
    .select("id");
  if (claim.error) throw new Error(`claim auto-reply: ${claim.error.message}`);
  if (!claim.data?.length) return; // already replied (or replying)

  let sent: Awaited<ReturnType<typeof sendText>>;
  try {
    sent = await sendText(message.from, text);
  } catch (err) {
    // Release the claim so the retry can try again.
    await db().from("messages").update({ auto_reply_state: null }).eq("wa_message_id", message.id);
    throw err;
  }

  await db().from("messages").update({ auto_reply_state: "sent" }).eq("wa_message_id", message.id);
  await recordOutbound(sent.id, message.from, text, sent.response, "bot");
}

export async function recordOutbound(
  waMessageId: string,
  to: string,
  body: string,
  response: unknown,
  sentBy: "bot" | "staff",
): Promise<void> {
  const { error } = await db()
    .from("messages")
    .upsert(
      {
        wa_message_id: waMessageId,
        direction: "out",
        wa_id: to,
        phone_number_id: env.phoneNumberId,
        type: "text",
        body,
        payload: response,
        sent_by: sentBy,
        status: "accepted",
        wa_timestamp: new Date().toISOString(),
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`insert outbound message: ${error.message}`);
  // A status may have arrived before this row existed.
  await refreshStatus(waMessageId);
}

async function handleStatus(status: WaStatus): Promise<void> {
  const { error } = await db()
    .from("message_statuses")
    .upsert(
      {
        wa_message_id: status.id,
        status: status.status,
        recipient_id: status.recipient_id ?? null,
        wa_timestamp: toIso(status.timestamp),
        errors: status.errors ?? null,
        payload: status,
      },
      { onConflict: "wa_message_id,status", ignoreDuplicates: true },
    );
  if (error) throw new Error(`insert status: ${error.message}`);
  await refreshStatus(status.id);
}

async function refreshStatus(waMessageId: string): Promise<void> {
  const { error } = await db().rpc("refresh_message_status", { p_wa_message_id: waMessageId });
  if (error) throw new Error(`refresh_message_status: ${error.message}`);
}

function mediaOf(message: WaMessage) {
  return message.image ?? message.video ?? message.audio ?? message.document ?? message.sticker ?? null;
}

function bodyOf(message: WaMessage): string | null {
  switch (message.type) {
    case "text":
      return message.text?.body ?? null;
    case "image":
    case "video":
      return mediaOf(message)?.caption ?? null;
    case "document":
      return message.document?.caption ?? message.document?.filename ?? null;
    case "interactive":
      return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
    case "button":
      return message.button?.text ?? null;
    case "reaction":
      return message.reaction?.emoji ?? null;
    case "location": {
      const loc = message.location;
      return loc ? [loc.name, loc.address, `${loc.latitude},${loc.longitude}`].filter(Boolean).join(" · ") : null;
    }
    default:
      return null;
  }
}

function toIso(unixSeconds: string | undefined): string | null {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}
