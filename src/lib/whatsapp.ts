import { env } from "./env";

// Shapes of the parts of the webhook payload we use. Meta sends more fields;
// the full object is always kept in the stored payload.
export type WaMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WaMedia;
  video?: WaMedia;
  audio?: WaMedia;
  sticker?: WaMedia;
  document?: WaMedia & { filename?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload?: string; text?: string };
  reaction?: { message_id: string; emoji?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};

type WaMedia = { id: string; mime_type?: string; caption?: string };

export type WaStatus = {
  id: string;
  status: string;
  timestamp: string;
  recipient_id?: string;
  errors?: unknown[];
};

export type WaContact = { wa_id: string; profile?: { name?: string } };

export type WaChangeValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
  errors?: unknown[];
};

export type WaWebhookPayload = {
  object?: string;
  entry?: { id: string; changes?: { field: string; value?: WaChangeValue }[] }[];
};

/** Send a plain text message. Returns the new WhatsApp message ID. */
export async function sendText(to: string, body: string): Promise<{ id: string; response: unknown }> {
  const url = `https://graph.facebook.com/${env.graphApiVersion}/${env.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body, preview_url: false },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const json = (await res.json().catch(() => null)) as
    | { messages?: { id: string }[]; error?: { code?: number; message?: string } }
    | null;
  const id = json?.messages?.[0]?.id;
  if (!res.ok || !id) {
    const err = json?.error;
    throw new Error(`WhatsApp send failed: HTTP ${res.status}${err ? ` code ${err.code}: ${err.message}` : ""}`);
  }
  return { id, response: json };
}
