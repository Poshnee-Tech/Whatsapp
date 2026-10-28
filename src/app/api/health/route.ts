import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** For uptime monitors: 200 when the database is reachable, plus backlog counts. */
export async function GET() {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [backlog, dead, schema] = await Promise.all([
    db()
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "failed", "processing"])
      .lt("received_at", staleBefore),
    db().from("webhook_events").select("id", { count: "exact", head: true }).eq("status", "dead"),
    // Fails until supabase/migrations/003_inbox_v2.sql has been run.
    db().from("messages").select("sent_by", { head: true }).limit(1),
  ]);

  if (backlog.error || dead.error) {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
  return Response.json({
    ok: true,
    schemaUpToDate: !schema.error,
    stuckEvents: backlog.count ?? 0,
    deadEvents: dead.count ?? 0,
  });
}
