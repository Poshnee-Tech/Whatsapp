"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lastInboundAt, SERVICE_WINDOW_MS, setBotPaused } from "@/lib/inbox";
import { recordOutbound } from "@/lib/process";
import { createSession, destroySession, hasSession } from "@/lib/session";
import { safeEqual } from "@/lib/signature";
import { sendText } from "@/lib/whatsapp";

export async function login(formData: FormData): Promise<void> {
  const expected = process.env.INBOX_PASSWORD;
  if (!expected || !process.env.INBOX_SESSION_SECRET) redirect("/login?error=config");

  const password = String(formData.get("password") ?? "");
  if (!safeEqual(password, expected)) {
    // Slow down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    redirect("/login?error=password");
  }
  await createSession();
  redirect("/inbox");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export type ReplyState = { error?: string; sentAt?: number };

const WA_ID = /^\d{6,20}$/;

export async function sendReply(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  if (!(await hasSession())) return { error: "Your session has expired. Sign in again." };

  const waId = String(formData.get("wa_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!WA_ID.test(waId)) return { error: "Unknown conversation." };
  if (!text) return { error: "Type a message first." };
  if (text.length > 4096) return { error: "Messages can be at most 4,096 characters." };

  try {
    const last = await lastInboundAt(waId);
    if (!last || Date.now() - last > SERVICE_WINDOW_MS) {
      return { error: "The 24-hour reply window has closed. The customer needs to message first." };
    }
    const sent = await sendText(waId, text);
    await recordOutbound(sent.id, waId, text, sent.response, "staff");
    // A staff reply hands the conversation over from the bot.
    await setBotPaused(waId, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[inbox] sendReply failed: ${message}`);
    return {
      error: message.startsWith("Missing environment variable")
        ? "Sending isn't set up yet: add the WhatsApp keys in Vercel and redeploy."
        : `Message not sent. ${message}`,
    };
  }

  revalidatePath("/inbox");
  return { sentAt: Date.now() };
}

export async function setBot(formData: FormData): Promise<void> {
  if (!(await hasSession())) redirect("/login");
  const waId = String(formData.get("wa_id") ?? "");
  if (!WA_ID.test(waId)) return;
  await setBotPaused(waId, formData.get("paused") === "true");
  revalidatePath("/inbox");
}
