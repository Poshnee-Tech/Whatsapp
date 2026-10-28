import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { listConversations, listMessages, typeLabel, type Conversation, type InboxMessage } from "@/lib/inbox";
import { hasSession } from "@/lib/session";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox · Poshnee WhatsApp", robots: { index: false, follow: false } };

const TIME_ZONE = "Europe/London";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  if (!(await hasSession())) redirect("/login");
  const { c: selected } = await searchParams;

  let conversations: Conversation[] = [];
  let messages: InboxMessage[] = [];
  let loadError: string | null = null;
  try {
    [conversations, messages] = await Promise.all([
      listConversations(),
      selected ? listMessages(selected) : Promise.resolve([]),
    ]);
  } catch (err) {
    console.error(`[inbox] ${err instanceof Error ? err.message : err}`);
    loadError = err instanceof Error && err.message.includes("inbox_conversations")
      ? "The inbox database function is missing. Run supabase/migrations/002_inbox.sql in the Supabase SQL Editor."
      : "Could not load messages. Check the Supabase settings in Vercel.";
  }

  const current = conversations.find((c) => c.wa_id === selected);

  return (
    <div className={`inbox${selected ? " has-selection" : ""}`}>
      <AutoRefresh />

      <aside className="conversations">
        <header className="pane-header">
          <strong>Poshnee WhatsApp</strong>
          <form action={logout}>
            <button type="submit" className="link-button">Sign out</button>
          </form>
        </header>

        {loadError && <p className="notice error">{loadError}</p>}
        {!loadError && conversations.length === 0 && (
          <p className="notice">No messages yet. They appear here as soon as customers write to the business number.</p>
        )}

        <nav>
          {conversations.map((c) => (
            <Link
              key={c.wa_id}
              href={`/inbox?c=${encodeURIComponent(c.wa_id)}`}
              className={`conversation${c.wa_id === selected ? " active" : ""}`}
            >
              <span className="conversation-top">
                <span className="name">{c.profile_name || formatPhone(c.wa_id)}</span>
                <time className="muted">{formatListTime(c.last_at)}</time>
              </span>
              <span className="preview muted">
                {c.last_direction === "out" && "You: "}
                {c.last_body ?? typeLabel(c.last_type) ?? ""}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="thread">
        {selected ? (
          <>
            <header className="pane-header">
              <Link href="/inbox" className="back" aria-label="Back to conversations">←</Link>
              <div>
                <strong>{current?.profile_name || formatPhone(selected)}</strong>
                {current?.profile_name && <div className="muted small">{formatPhone(selected)}</div>}
              </div>
            </header>
            {/* column-reverse keeps the view pinned to the newest message */}
            <div className="messages">
              {messages.map((m) => (
                <MessageBubble key={m.wa_message_id} message={m} />
              ))}
            </div>
            <footer className="composer muted small">Read-only for now. Replying from the inbox comes in the next phase.</footer>
          </>
        ) : (
          <p className="empty-thread muted">Select a conversation</p>
        )}
      </section>
    </div>
  );
}

function MessageBubble({ message: m }: { message: InboxMessage }) {
  const label = typeLabel(m.type);
  return (
    <div className={`bubble ${m.direction}`}>
      {label && <span className="type-label">{label}</span>}
      {m.body && <p>{m.body}</p>}
      <span className="meta">
        <time>{formatTime(m.wa_timestamp ?? m.created_at)}</time>
        {m.direction === "out" && <StatusTicks status={m.status} />}
      </span>
    </div>
  );
}

function StatusTicks({ status }: { status: string | null }) {
  switch (status) {
    case "sent":
      return <span className="ticks" title="Sent">✓</span>;
    case "delivered":
      return <span className="ticks" title="Delivered">✓✓</span>;
    case "read":
      return <span className="ticks read" title="Read">✓✓</span>;
    case "failed":
      return <span className="ticks failed" title="Failed">Failed</span>;
    default:
      return <span className="ticks" title="Sending">🕓</span>;
  }
}

function formatPhone(waId: string): string {
  return `+${waId}`;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(iso));
}

function formatListTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = (a: Date, b: Date) =>
    a.toLocaleDateString("en-GB", { timeZone: TIME_ZONE }) === b.toLocaleDateString("en-GB", { timeZone: TIME_ZONE });
  return sameDay(date, new Date())
    ? new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short" }).format(date);
}
