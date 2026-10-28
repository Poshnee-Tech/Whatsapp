import { env } from "@/lib/env";
import { processBacklog } from "@/lib/process";
import { safeEqual } from "@/lib/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retries pending/failed/stuck events. Vercel cron calls it daily with
 * "Authorization: Bearer $CRON_SECRET". Call it yourself to replay on demand;
 * add ?dead=1 to also replay events that ran out of attempts.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Dead events are only picked up on the first pass, so ones that fail
  // again aren't replayed in a loop.
  let includeDead = new URL(req.url).searchParams.get("dead") === "1";
  const deadline = Date.now() + 45_000;
  let processed = 0;

  while (Date.now() < deadline) {
    const n = await processBacklog(20, includeDead);
    includeDead = false;
    processed += n;
    if (n === 0) break;
  }

  return Response.json({ processed });
}
