-- =====================================================================
-- KapitPondo — Migration 0050
-- Direct (1:1) messages between two active members of the same group —
-- backs "Contact an officer" and "Members" on the Messages screen
-- (previously soon:true placeholders in messages.tsx).
--
-- Kept in its own table rather than folded into `messages` (0030): a DM has
-- no `channel`, its "channel" IS the pair (sender_id, recipient_id).
-- =====================================================================

create table direct_messages (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups(id) on delete cascade,
  sender_id     uuid not null references members(id),
  recipient_id  uuid not null references members(id),
  -- Denormalized at write time, same reasoning as messages.sender_name
  -- (0030) — a realtime INSERT payload renders without a join, and a later
  -- name change doesn't rewrite history.
  sender_name   text not null,
  body          text not null default '',
  image_url     text,
  created_at    timestamptz not null default now(),

  constraint dm_not_self check (sender_id <> recipient_id),
  constraint dm_body_or_image check (
    char_length(body) <= 2000
    and (char_length(btrim(body)) > 0 or image_url is not null)
  )
);

-- Query pattern: "every message between me and them in this group, newest
-- first" — least/greatest normalizes the pair so one index serves both
-- directions without a UNION.
create index idx_dm_pair_created
  on direct_messages (group_id, least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);

-- =====================================================================
-- RLS — enabled immediately, no gap.
-- =====================================================================
alter table direct_messages enable row level security;

create policy "direct_messages: read own conversations"
  on direct_messages for select
  to authenticated
  using (
    (select id from members where auth_id = auth.uid()) in (sender_id, recipient_id)
  );

-- INSERT — defense in depth (writes in v1 go through the backend's
-- service-role client, which also re-checks the recipient is an active
-- member of the same group — RLS here only guards the sender half).
create policy "direct_messages: insert as self"
  on direct_messages for insert
  to authenticated
  with check (
    sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = sender_id and status = 'active'
    )
  );

-- =====================================================================
-- Realtime: publish INSERTs so both sides see new DMs live.
-- =====================================================================
alter publication supabase_realtime add table direct_messages;

-- =====================================================================
-- End of 0050_direct_messages.sql
-- =====================================================================
