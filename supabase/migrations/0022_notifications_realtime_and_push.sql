-- =====================================================================
-- KapitPondo — Migration 0022
-- Real-time notification delivery:
--   1. RLS + a Realtime publication entry for `notifications`, so the
--      mobile app's anon-key client can subscribe to postgres_changes
--      (INSERT) on its own rows the instant the backend writes them.
--   2. `push_tokens` so the backend can also fan a notification out as an
--      Expo push when the recipient's app is backgrounded/killed.
-- Run this once — `alter publication ... add table` errors if repeated.
-- =====================================================================

alter table notifications enable row level security;

create policy "notifications: read own"
  on notifications for select
  to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

alter publication supabase_realtime add table notifications;

create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  token       text not null unique,
  platform    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_push_tokens_member on push_tokens (member_id);

-- =====================================================================
-- End of 0022_notifications_realtime_and_push.sql
-- =====================================================================
