import { db } from "./db";

// Free-form messages are only allowed within 24h of the customer's last message.
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Conversation = {
  wa_id: string;
  profile_name: string | null;
  last_body: string | null;
  last_type: string;
  last_direction: "in" | "out";
  last_status: string | null;
  last_at: string;
  last_inbound_at: string | null;
  unread_count: number;
  bot_paused: boolean;
};

export type InboxMessage = {
  wa_message_id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  status: string | null;
  sent_by: "bot" | "staff" | null;
  wa_timestamp: string | null;
  created_at: string;
};

export async function listConversations(search?: string, limit = 100): Promise<Conversation[]> {
  const { data, error } = await db().rpc("inbox_conversations", {
    p_limit: limit,
    p_search: search?.trim() || null,
  });
  if (error) throw new Error(`inbox_conversations: ${error.message}`);
  return (data ?? []) as Conversation[];
}

/** The latest messages of one conversation, newest first. */
export async function listMessages(waId: string, limit = 200): Promise<InboxMessage[]> {
  const { data, error } = await db()
    .from("messages")
    .select("wa_message_id, direction, type, body, status, sent_by, wa_timestamp, created_at")
    .eq("wa_id", waId)
    .order("wa_timestamp", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`messages: ${error.message}`);
  return (data ?? []) as InboxMessage[];
}

export async function markRead(waId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db().from("conversations").upsert({ wa_id: waId, last_read_at: now, updated_at: now });
  if (error) console.error(`[inbox] markRead: ${error.message}`);
}

export async function setBotPaused(waId: string, paused: boolean): Promise<void> {
  const { error } = await db()
    .from("conversations")
    .upsert({ wa_id: waId, bot_paused: paused, updated_at: new Date().toISOString() });
  if (error) throw new Error(`setBotPaused: ${error.message}`);
}

/** Whether staff have taken over this conversation. Fails open (bot active). */
export async function isBotPaused(waId: string): Promise<boolean> {
  const { data, error } = await db().from("conversations").select("bot_paused").eq("wa_id", waId).maybeSingle();
  if (error) console.error(`[inbox] isBotPaused: ${error.message}`);
  return data?.bot_paused === true;
}

/** Time of the customer's most recent message, which opens the 24h window. */
export async function lastInboundAt(waId: string): Promise<number | null> {
  const { data, error } = await db()
    .from("messages")
    .select("wa_timestamp, created_at")
    .eq("wa_id", waId)
    .eq("direction", "in")
    .order("wa_timestamp", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`lastInboundAt: ${error.message}`);
  return data ? new Date(data.wa_timestamp ?? data.created_at).getTime() : null;
}

/** Short label for non-text messages, since media isn't downloaded yet. */
export function typeLabel(type: string): string | null {
  const labels: Record<string, string> = {
    image: "Photo",
    video: "Video",
    audio: "Audio",
    voice: "Voice message",
    document: "Document",
    sticker: "Sticker",
    location: "Location",
    reaction: "Reaction",
    interactive: "Button reply",
    button: "Button reply",
    contacts: "Contact card",
    unsupported: "Unsupported message",
  };
  return type === "text" ? null : (labels[type] ?? type);
}
