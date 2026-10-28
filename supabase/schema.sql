-- Poshnee WhatsApp MVP schema.
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Raw webhook deliveries. Every verified POST is stored here BEFORE Meta gets
-- its 200, so an acknowledged event can always be (re)processed.
-- ---------------------------------------------------------------------------
create table if not exists webhook_events (
  id            bigint generated always as identity primary key,
  received_at   timestamptz not null default now(),
  payload       jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts      int not null default 0,
  last_error    text,
  locked_at     timestamptz,
  processed_at  timestamptz
);
create index if not exists webhook_events_status_idx on webhook_events (status, id);

create table if not exists contacts (
  wa_id         text primary key,
  profile_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per WhatsApp message, both directions. wa_message_id is unique, so
-- repeated deliveries of the same message are ignored.
create table if not exists messages (
  id                 bigint generated always as identity primary key,
  wa_message_id      text not null unique,
  direction          text not null check (direction in ('in', 'out')),
  wa_id              text not null,          -- the customer's WhatsApp ID
  phone_number_id    text,                   -- our business number
  type               text not null,
  body               text,
  media_id           text,
  media_mime_type    text,
  payload            jsonb not null,
  status             text,                   -- outbound: accepted/sent/delivered/read/failed
  status_updated_at  timestamptz,
  error              jsonb,
  auto_reply_state   text check (auto_reply_state in ('sending', 'sent')),
  sent_by            text check (sent_by in ('bot', 'staff')),  -- outbound only
  wa_timestamp       timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists messages_wa_id_idx on messages (wa_id, created_at desc);

-- Every status notification we receive, deduplicated per (message, status).
-- messages.status is derived from this table, so arrival order doesn't matter.
create table if not exists message_statuses (
  id             bigint generated always as identity primary key,
  wa_message_id  text not null,
  status         text not null,
  recipient_id   text,
  wa_timestamp   timestamptz,
  errors         jsonb,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  unique (wa_message_id, status)
);

-- Per-conversation state kept by the inbox.
create table if not exists conversations (
  wa_id         text primary key,
  last_read_at  timestamptz,
  bot_paused    boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- Lock everything down: no policies means the public anon key can read nothing.
-- The server uses the secret key, which bypasses RLS.
alter table webhook_events   enable row level security;
alter table contacts         enable row level security;
alter table messages         enable row level security;
alter table message_statuses enable row level security;
alter table conversations    enable row level security;

-- ---------------------------------------------------------------------------
-- Functions (called via supabase.rpc)
-- ---------------------------------------------------------------------------

create or replace function status_rank(s text) returns int
language sql immutable as $$
  select case s
    when 'sent' then 1
    when 'delivered' then 2
    when 'read' then 3
    when 'failed' then 4
    else 0
  end
$$;

-- Set messages.status to the most advanced status seen so far. Late or
-- out-of-order notifications never move a message backwards.
create or replace function refresh_message_status(p_wa_message_id text) returns void
language sql as $$
  update messages m
     set status = s.status,
         status_updated_at = s.wa_timestamp,
         error = s.errors
    from (
      select status, wa_timestamp, errors
        from message_statuses
       where wa_message_id = p_wa_message_id
       order by status_rank(status) desc, wa_timestamp desc nulls last
       limit 1
    ) s
   where m.wa_message_id = p_wa_message_id
     and status_rank(s.status) >= status_rank(coalesce(m.status, ''));
$$;

-- Claim one freshly received event for processing.
create or replace function claim_webhook_event(p_id bigint)
returns setof webhook_events
language sql as $$
  update webhook_events
     set status = 'processing', locked_at = now(), attempts = attempts + 1
   where id = p_id and status = 'pending'
  returning *;
$$;

-- Claim a batch of events that still need work: pending, failed (after a
-- short back-off), or stuck in processing because a function was killed.
create or replace function claim_webhook_events(p_limit int default 20, p_include_dead boolean default false)
returns setof webhook_events
language sql as $$
  update webhook_events e
     set status = 'processing', locked_at = now(), attempts = e.attempts + 1
   where e.id in (
     select id from webhook_events
      where status = 'pending'
         or (status = 'failed' and locked_at < now() - interval '1 minute')
         or (status = 'processing' and locked_at < now() - interval '5 minutes')
         or (p_include_dead and status = 'dead')
      order by id
      limit p_limit
      for update skip locked
   )
  returning e.*;
$$;

-- Conversation list for the staff inbox: latest message, unread count, bot state.
create or replace function inbox_conversations(p_limit int default 100, p_search text default null)
returns table (
  wa_id text, profile_name text, last_body text, last_type text, last_direction text,
  last_status text, last_at timestamptz, last_inbound_at timestamptz,
  unread_count bigint, bot_paused boolean
)
language sql stable as $$
  with latest as (
    select distinct on (wa_id) wa_id, body, type, direction, status,
           coalesce(wa_timestamp, created_at) as at
      from messages
     order by wa_id, coalesce(wa_timestamp, created_at) desc
  ),
  inbound as (
    select m.wa_id,
           max(coalesce(m.wa_timestamp, m.created_at)) as last_inbound_at,
           count(*) filter (where m.created_at > coalesce(cv.last_read_at, '-infinity')) as unread_count
      from messages m
      left join conversations cv using (wa_id)
     where m.direction = 'in'
     group by m.wa_id
  )
  select l.wa_id, c.profile_name, l.body, l.type, l.direction, l.status, l.at,
         i.last_inbound_at, coalesce(i.unread_count, 0), coalesce(cv.bot_paused, false)
    from latest l
    left join inbound i using (wa_id)
    left join contacts c using (wa_id)
    left join conversations cv using (wa_id)
   where p_search is null
      or l.wa_id ilike '%' || p_search || '%'
      or c.profile_name ilike '%' || p_search || '%'
   order by l.at desc
   limit p_limit;
$$;

-- Only the server (secret key) may call these.
revoke execute on function refresh_message_status(text)        from public, anon, authenticated;
revoke execute on function claim_webhook_event(bigint)         from public, anon, authenticated;
revoke execute on function claim_webhook_events(int, boolean)  from public, anon, authenticated;
grant  execute on function refresh_message_status(text)        to service_role;
grant  execute on function claim_webhook_event(bigint)         to service_role;
grant  execute on function claim_webhook_events(int, boolean)  to service_role;
revoke execute on function inbox_conversations(int, text)      from public, anon, authenticated;
grant  execute on function inbox_conversations(int, text)      to service_role;
