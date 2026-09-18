-- =====================================================================
-- KapitPondo — Migration 0060
-- Member-submitted feedback for Profile's "Send feedback" row. Write-only
-- from the client's point of view (POST /api/me/feedback) — there is no
-- feedback inbox in the mobile app, so the only read path today is
-- backend-only (service-role) internal tooling. RLS here is
-- defense-in-depth rather than the enforcement boundary, matching
-- login_activity (0059).
-- =====================================================================

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  category    text not null check (category in ('bug', 'feature', 'general', 'other')),
  message     text not null,
  app_version text,
  platform    text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_feedback_member_created
  on feedback (member_id, created_at desc);

alter table feedback enable row level security;

create policy "feedback: read own"
  on feedback for select
  to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

-- =====================================================================
-- End of 0060_feedback.sql
-- =====================================================================
