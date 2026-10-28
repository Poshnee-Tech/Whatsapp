-- Adds the query behind the staff inbox's conversation list.
-- Run once in Supabase → SQL Editor (already included in schema.sql for new projects).

create or replace function inbox_conversations(p_limit int default 100)
returns table (
  wa_id text, profile_name text, last_body text, last_type text,
  last_direction text, last_at timestamptz, message_count bigint
)
language sql stable as $$
  select l.wa_id, c.profile_name, l.body, l.type, l.direction, l.at, n.message_count
    from (
      select distinct on (wa_id) wa_id, body, type, direction,
             coalesce(wa_timestamp, created_at) as at
        from messages
       order by wa_id, coalesce(wa_timestamp, created_at) desc
    ) l
    join (select wa_id, count(*) as message_count from messages group by wa_id) n using (wa_id)
    left join contacts c using (wa_id)
   order by l.at desc
   limit p_limit;
$$;

revoke execute on function inbox_conversations(int) from public, anon, authenticated;
grant  execute on function inbox_conversations(int) to service_role;
