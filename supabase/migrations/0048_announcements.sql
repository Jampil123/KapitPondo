-- =====================================================================
-- KapitPondo — Migration 0048
-- Adds `announcements`: one-way, Owner-authored broadcasts to the group
-- (or a subset of it). Read-only for everyone else — there is no reply.
-- Mirrors 0030_messages.sql's shape: RLS enabled in this same migration
-- (0002's blanket grants would otherwise leave a bare `create table` open
-- to anon/authenticated), realtime published at the end.
--
-- Targeted sends (Treasurer payment reminders) deliberately do NOT use this
-- table — those stay private, one `notifications` row per recipient (see
-- services/api/src/lib/notifications.js), so nobody but the sender and each
-- individual recipient ever sees who was reminded.
-- =====================================================================

create type announcement_type as enum ('reminder', 'meeting', 'cycle', 'urgent');
create type announcement_audience as enum ('all', 'unpaid', 'officers');

create table announcements (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references groups(id) on delete cascade,
  sender_id        uuid not null references members(id),
  -- Denormalized at write time (same reasoning as messages.sender_name) so a
  -- realtime INSERT payload renders without a join, and a later name/role
  -- change doesn't rewrite the historical record of who announced what.
  sender_name      text not null,
  sender_role      text not null,
  type             announcement_type not null,
  body             text not null,
  audience         announcement_audience not null,
  -- How many members this actually reached, resolved at send time — shown
  -- back to the Owner ("sent to 16 members") without recomputing membership
  -- as of some possibly-different-by-now moment.
  recipient_count  integer not null default 0,
  created_at       timestamptz not null default now(),

  constraint announcements_body_not_blank
    check (char_length(btrim(body)) > 0 and char_length(body) <= 1000)
);

create index idx_announcements_group_created
  on announcements (group_id, created_at desc);

-- =====================================================================
-- RLS — enabled immediately, no gap.
-- =====================================================================
alter table announcements enable row level security;

-- SELECT: any active member of the group can read every announcement —
-- audience only controls who got PUSHED/notified, not who can look it up
-- later (same "disclosed, not secret" stance as the officers chat channel).
create policy "announcements: read as active member"
  on announcements for select
  to authenticated
  using (
    group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
    )
  );

-- INSERT — defense in depth. Writes in v1 go through the backend
-- (service-role key, bypasses RLS); without this, 0002's blanket grants
-- would let any authenticated client insert directly as anyone.
create policy "announcements: insert as owner"
  on announcements for insert
  to authenticated
  with check (
    sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
        and role = 'owner'
    )
  );

-- =====================================================================
-- Realtime: publish INSERTs so the Messages/Announcements screens update
-- live, same as messages.
-- =====================================================================
alter publication supabase_realtime add table announcements;

-- =====================================================================
-- End of 0048_announcements.sql
-- =====================================================================
