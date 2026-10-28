import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { logout, setBot } from "@/app/actions";
import {
  listConversations,
  listMessages,
  markRead,
  SERVICE_WINDOW_MS,
  typeLabel,
  type Conversation,
  type InboxMessage,
} from "@/lib/inbox";
import { hasSession } from "@/lib/session";
import { AutoRefresh } from "./AutoRefresh";
import { Composer } from "./Composer";
import { AlertIcon, BackIcon, BotIcon, ChatIcon, CheckIcon, ClockIcon, DoubleCheckIcon, LogoutIcon, SearchIcon } from "./icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox · Poshnee WhatsApp", robots: { index: false, follow: false } };

const TIME_ZONE = "Europe/London";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  if (!(await hasSession())) redirect("/login");
  const { c: selected, q: search } = await searchParams;

  let conversations: Conversation[] = [];
  let messages: InboxMessage[] = [];
  let loadError: string | null = null;
  try {
    if (selected) await markRead(selected);
    [conversations, messages] = await Promise.all([
      listConversations(search),
      selected ? listMessages(selected) : Promise.resolve([]),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[inbox] ${message}`);
    loadError = /inbox_conversations|sent_by|conversations/.test(message)
      ? "The database needs an update. Run supabase/migrations/003_inbox_v2.sql in the Supabase SQL Editor."
      : "Couldn't load conversations. Check the Supabase settings in Vercel.";
  }

  const current = conversations.find((c) => c.wa_id === selected);
  const query = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/inbox?${s}` : "/inbox";
  };

  return (
    <div className={`inbox${selected ? " has-selection" : ""}`}>
      <AutoRefresh />

      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="brand">
            <span className="brand-mark">P</span>
            <div>
              <strong>Poshnee</strong>
              <span className="muted small">WhatsApp inbox</span>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="icon-button" title="Sign out" aria-label="Sign out">
              <LogoutIcon />
            </button>
          </form>
        </header>

        <form className="search" action="/inbox">
          <SearchIcon className="search-icon" />
          <input type="search" name="q" defaultValue={search} placeholder="Search name or number" aria-label="Search conversations" />
          {selected && <input type="hidden" name="c" value={selected} />}
        </form>

        {loadError && (
          <p className="banner error">
            <AlertIcon /> {loadError}
          </p>
        )}

        <nav className="conversation-list" aria-label="Conversations">
          {!loadError && conversations.length === 0 && (
            <div className="list-empty">
              <ChatIcon className="list-empty-icon" />
              <p>{search ? `No conversations match “${search}”.` : "No messages yet."}</p>
              {!search && <p className="muted small">Conversations appear here as soon as a customer messages the business number.</p>}
            </div>
          )}

          {conversations.map((c) => {
            const unread = c.wa_id !== selected ? Number(c.unread_count) : 0;
            return (
              <Link
                key={c.wa_id}
                href={query({ c: c.wa_id, q: search })}
                className={`conversation${c.wa_id === selected ? " active" : ""}${unread ? " unread" : ""}`}
              >
                <Avatar waId={c.wa_id} name={c.profile_name} />
                <span className="conversation-body">
                  <span className="conversation-row">
                    <span className="name">{c.profile_name || formatPhone(c.wa_id)}</span>
                    <time className="conversation-time">{formatListTime(c.last_at)}</time>
                  </span>
                  <span className="conversation-row">
                    <span className="preview">
                      {c.last_direction === "out" && <StatusIcon status={c.last_status} />}
                      {c.last_body ?? typeLabel(c.last_type) ?? ""}
                    </span>
                    {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="thread">
        {selected ? (
          <>
            <header className="thread-header">
              <Link href={query({ q: search })} className="icon-button back" aria-label="Back to conversations">
                <BackIcon />
              </Link>
              <Avatar waId={selected} name={current?.profile_name ?? null} />
              <div className="thread-title">
                <strong>{current?.profile_name || formatPhone(selected)}</strong>
                <span className="muted small">
                  {current?.profile_name ? `${formatPhone(selected)} · ` : ""}
                  <WindowStatus lastInboundAt={current?.last_inbound_at ?? null} />
                </span>
              </div>
              <form action={setBot} className="bot-toggle">
                <input type="hidden" name="wa_id" value={selected} />
                <input type="hidden" name="paused" value={current?.bot_paused ? "false" : "true"} />
                <button
                  type="submit"
                  className={`chip${current?.bot_paused ? "" : " chip-on"}`}
                  title={current?.bot_paused ? "Staff are handling this chat. Click to let the bot reply again." : "The bot can auto-reply. Click to pause it."}
                >
                  <BotIcon />
                  {current?.bot_paused ? "Bot paused" : "Bot on"}
                </button>
              </form>
            </header>

            <div className="messages" aria-live="polite">
              {withDaySeparators(messages)}
            </div>

            {isWindowOpen(current?.last_inbound_at ?? null) ? (
              <Composer key={selected} waId={selected} />
            ) : (
              <p className="composer-closed">
                <ClockIcon /> The 24-hour reply window is closed. You can reply once the customer messages again.
              </p>
            )}
          </>
        ) : (
          <div className="thread-empty">
            <ChatIcon className="thread-empty-icon" />
            <h2>Poshnee WhatsApp inbox</h2>
            <p className="muted">Select a conversation to read and reply.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Messages arrive newest first and are shown in a column-reverse list, so a
// day's separator goes after its oldest message in DOM order.
function withDaySeparators(messages: InboxMessage[]) {
  const out: ReactNode[] = [];
  messages.forEach((m, i) => {
    out.push(<MessageBubble key={m.wa_message_id} message={m} />);
    const day = dayKey(timeOf(m));
    const next = messages[i + 1];
    if (!next || dayKey(timeOf(next)) !== day) {
      out.push(
        <div key={`day-${day}`} className="day-separator">
          <span>{formatDay(timeOf(m))}</span>
        </div>,
      );
    }
  });
  return out;
}

function MessageBubble({ message: m }: { message: InboxMessage }) {
  const label = typeLabel(m.type);
  return (
    <div className={`bubble ${m.direction}`}>
      {m.direction === "out" && m.sent_by === "bot" && (
        <span className="sender-tag">
          <BotIcon /> Auto-reply
        </span>
      )}
      {label && <span className="type-label">{label}</span>}
      {m.body && <p>{m.body}</p>}
      <span className="meta">
        <time dateTime={timeOf(m)}>{formatTime(timeOf(m))}</time>
        {m.direction === "out" && <StatusIcon status={m.status} />}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: string | null }) {
  switch (status) {
    case "sent":
      return <CheckIcon className="tick" title="Sent" />;
    case "delivered":
      return <DoubleCheckIcon className="tick" title="Delivered" />;
    case "read":
      return <DoubleCheckIcon className="tick read" title="Read" />;
    case "failed":
      return <AlertIcon className="tick failed" title="Failed to send" />;
    default:
      return <ClockIcon className="tick" title="Sending" />;
  }
}

function WindowStatus({ lastInboundAt }: { lastInboundAt: string | null }) {
  if (!isWindowOpen(lastInboundAt)) return <span>Reply window closed</span>;
  const left = SERVICE_WINDOW_MS - (Date.now() - new Date(lastInboundAt!).getTime());
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return <span className="window-open">Reply window: {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`} left</span>;
}

function Avatar({ waId, name }: { waId: string; name: string | null }) {
  const initials = name
    ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")
    : waId.slice(-2);
  let hash = 0;
  for (const ch of waId) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ "--hue": hash } as CSSProperties} aria-hidden>
      {initials}
    </span>
  );
}

function isWindowOpen(lastInboundAt: string | null): boolean {
  return !!lastInboundAt && Date.now() - new Date(lastInboundAt).getTime() < SERVICE_WINDOW_MS;
}

function timeOf(m: InboxMessage): string {
  return m.wa_timestamp ?? m.created_at;
}

function formatPhone(waId: string): string {
  return `+${waId}`;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, ...opts });
const dayKey = (iso: string) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

function formatTime(iso: string): string {
  return fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatDay(iso: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const key = dayKey(iso);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function formatListTime(iso: string): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return formatTime(iso);
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return "Yesterday";
  return fmt({ day: "numeric", month: "short" }).format(new Date(iso));
}
