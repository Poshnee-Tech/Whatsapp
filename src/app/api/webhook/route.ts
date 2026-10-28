import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { processBacklog, processEventById } from "@/lib/process";
import { safeEqual, verifyMetaSignature } from "@/lib/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Meta's one-time verification handshake when the callback URL is saved. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token && challenge && safeEqual(token, env.verifyToken)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Incoming messages and status updates. */
export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());

  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env.metaAppSecret)) {
    console.warn("[webhook] rejected request with invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Store before acknowledging. If this fails, Meta gets a 500 and retries.
  const { data, error } = await db().from("webhook_events").insert({ payload }).select("id").single();
  if (error || !data) {
    console.error(`[webhook] could not store event: ${error?.message}`);
    return new Response("Storage unavailable", { status: 500 });
  }

  // Runs after the 200 is sent: process this event, then any leftovers.
  after(async () => {
    try {
      await processEventById(data.id);
      await processBacklog(5);
    } catch (err) {
      console.error(`[webhook] background processing error: ${err instanceof Error ? err.message : err}`);
    }
  });

  return new Response("EVENT_RECEIVED", { status: 200 });
}
