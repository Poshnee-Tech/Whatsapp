import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** For uptime monitors: 200 when the database is reachable, plus backlog counts. */
export async function GET() {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [backlog, dead] = await Promise.all([
    db()
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "failed", "processing"])
      .lt("received_at", staleBefore),
    db().from("webhook_events").select("id", { count: "exact", head: true }).eq("status", "dead"),
  ]);

  if (backlog.error || dead.error) {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
  return Response.json({ ok: true, stuckEvents: backlog.count ?? 0, deadEvents: dead.count ?? 0 });
}
