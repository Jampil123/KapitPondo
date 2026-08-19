-- =====================================================================
-- KapitPondo — Migration 0018
-- Adds the `messages` table for group chat (two channels: officers, general).
-- Real-time delivery via Supabase Realtime (postgres_changes). RLS is enabled
-- and policies attached in THIS SAME migration — 0002's blanket grants mean a
-- bare `create table` here would otherwise be open to anon/authenticated
-- until a later migration closed it.
-- =====================================================================

create type message_channel as enum ('officers', 'general');

create table messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  channel     message_channel not null,
  sender_id   uuid not null references members(id),
  -- Denormalized at write time (backend already has req.member.full_name)
  -- so a realtime INSERT payload is self-sufficient — no join needed to
  -- render a bubble. A later name change does not rewrite old messages.
  sender_name text not null,
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint messages_body_not_blank
    check (char_length(btrim(body)) > 0 and char_length(body) <= 2000)
);

-- Query pattern: "give me channel X of group Y, newest first, paged by cursor"
create index idx_messages_group_channel_created
  on messages (group_id, channel, created_at desc);

-- =====================================================================
-- RLS — enabled immediately, no gap.
-- =====================================================================
alter table messages enable row level security;

-- SELECT: general channel — any active member of the group.
create policy "messages: read general as active member"
  on messages for select
  to authenticated
  using (
    channel = 'general'
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
    )
  );

-- SELECT: officers channel — active member with an officer role only.
create policy "messages: read officers as officer"
  on messages for select
  to authenticated
  using (
    channel = 'officers'
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
        and role in ('owner', 'treasurer', 'auditor')
    )
  );

-- INSERT policies — defense in depth. All writes in v1 go through the backend
-- (service-role key, bypasses RLS), but 0002's blanket grants mean the anon/
-- authenticated Postgres roles otherwise have raw table access; without these,
-- a client holding only the anon/authenticated key could insert directly,
-- skipping the backend's trim/length validation and channel gate.
create policy "messages: insert general as active member"
  on messages for insert
  to authenticated
  with check (
    channel = 'general'
    and sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
    )
  );

create policy "messages: insert officers as officer"
  on messages for insert
  to authenticated
  with check (
    channel = 'officers'
    and sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
        and role in ('owner', 'treasurer', 'auditor')
    )
  );

-- =====================================================================
-- Realtime: publish INSERTs on `messages` to subscribed clients. Each
-- subscriber's own RLS SELECT policy still gates which rows they receive
-- (Realtime re-checks RLS per-subscriber regardless of how the row was
-- written — including rows written by the backend's service-role client).
-- =====================================================================
alter publication supabase_realtime add table messages;

-- =====================================================================
-- End of 0018_messages.sql
-- =====================================================================
