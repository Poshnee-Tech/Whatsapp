import { env } from "./env";
import type { WaMessage } from "./whatsapp";

/**
 * The reply engine: given an incoming message, return the text to send back,
 * or null for no reply. Greetings, business hours, FAQs (and later AI) plug in
 * here without touching the webhook or processing code.
 */
export function decideReply(message: WaMessage): string | null {
  if (env.autoReplyPing && message.type === "text" && message.text?.body.trim().toLowerCase() === "ping") {
    return "pong";
  }
  return null;
}
