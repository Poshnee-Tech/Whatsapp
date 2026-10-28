import { db } from "./db";

export type Conversation = {
  wa_id: string;
  profile_name: string | null;
  last_body: string | null;
  last_type: string;
  last_direction: "in" | "out";
  last_at: string;
  message_count: number;
};

export type InboxMessage = {
  wa_message_id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  media_mime_type: string | null;
  status: string | null;
  wa_timestamp: string | null;
  created_at: string;
};

export async function listConversations(limit = 100): Promise<Conversation[]> {
  const { data, error } = await db().rpc("inbox_conversations", { p_limit: limit });
  if (error) throw new Error(`inbox_conversations: ${error.message}`);
  return (data ?? []) as Conversation[];
}

/** The latest messages of one conversation, newest first. */
export async function listMessages(waId: string, limit = 200): Promise<InboxMessage[]> {
  const { data, error } = await db()
    .from("messages")
    .select("wa_message_id, direction, type, body, media_mime_type, status, wa_timestamp, created_at")
    .eq("wa_id", waId)
    .order("wa_timestamp", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`messages: ${error.message}`);
  return (data ?? []) as InboxMessage[];
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
