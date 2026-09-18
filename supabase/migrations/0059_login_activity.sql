-- =====================================================================
-- KapitPondo — Migration 0059
-- Self-reported login/session history for Profile's "Login activity"
-- row. Sign-in happens entirely client-side against Supabase Auth
-- (AuthContext.tsx calls supabase.auth.signInWithPassword/verifyOtp
-- directly) — the backend never otherwise sees a login event, so the
-- client records one itself right after a session is established
-- (POST /api/me/login-activity), authenticated by the fresh session
-- token it just got. Read via GET /api/me/login-activity, both routes
-- backend-only (service-role), so RLS here is defense-in-depth rather
-- than the enforcement boundary.
-- =====================================================================

create table if not exists login_activity (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  device_label text,
  platform     text,
  app_version  text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_login_activity_member_created
  on login_activity (member_id, created_at desc);

alter table login_activity enable row level security;

create policy "login_activity: read own"
  on login_activity for select
  to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

-- =====================================================================
-- End of 0059_login_activity.sql
-- =====================================================================
