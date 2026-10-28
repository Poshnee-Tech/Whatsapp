-- Inbox v2: unread counts, staff replies, bot handover, search.
-- Run once in Supabase → SQL Editor (already included in schema.sql for new projects).

-- Per-conversation state kept by the inbox.
create table if not exists conversations (
  wa_id         text primary key,
  last_read_at  timestamptz,
  bot_paused    boolean not null default false,
  updated_at    timestamptz not null default now()
);
alter table conversations enable row level security;

-- Who sent an outbound message: the bot or a staff member.
alter table messages add column if not exists sent_by text check (sent_by in ('bot', 'staff'));

drop function if exists inbox_conversations(int);
drop function if exists inbox_conversations(int, text);

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

revoke execute on function inbox_conversations(int, text) from public, anon, authenticated;
grant  execute on function inbox_conversations(int, text) to service_role;
