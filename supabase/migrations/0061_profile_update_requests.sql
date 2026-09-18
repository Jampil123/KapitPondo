-- =====================================================================
-- KapitPondo — Migration 0061
-- "Once a user's identity has been verified, verified personal
-- information shall be locked from direct editing. Users who need to
-- modify locked information must submit an Information Update Request
-- for review and, when applicable, undergo re-verification."
--
-- One row per field-change request (not a batch of fields at once) —
-- matches the mobile UI, where a member taps ONE locked field and
-- requests a fix for just that one. `field` is checked against the
-- exact set edit-profile.tsx edits; `reason` drives whether approving
-- the request also resets verification_status back to 'unverified'
-- (only a legal name change calls the verified identity into
-- question — a typo or address/financial correction does not).
-- Writes are backend-only (service-role), so RLS here is
-- defense-in-depth rather than the enforcement boundary, matching
-- login_activity (0059) and feedback (0060).
-- =====================================================================

create table if not exists profile_update_requests (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null references members(id) on delete cascade,
  field                   text not null check (field in (
    'first_name','middle_name','last_name','birthday','nationality',
    'region','province','city','barangay','street_address','zip_code',
    'source_of_funds','employment_status','occupation'
  )),
  current_value           text,
  new_value               text not null,
  reason                  text not null check (reason in ('typo','legal_name_change','other')),
  details                 text,
  proof_url               text,
  requires_reverification boolean not null default false,
  status                  text not null default 'pending' check (status in ('pending','approved','rejected')),
  -- No FK here: the reviewer is a sysadmin, identified by their auth.users.id
  -- (req.admin.user_id from requireSysAdmin.js) — not a members.id, which is
  -- an independently generated uuid unrelated to the auth user id (see
  -- handle_new_auth_user() in 0010_fix_new_member_phone_email.sql).
  reviewed_by             uuid,
  reviewed_at             timestamptz,
  rejection_reason        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_profile_update_requests_member_created
  on profile_update_requests (member_id, created_at desc);

alter table profile_update_requests enable row level security;

create policy "profile_update_requests: read own"
  on profile_update_requests for select
  to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

-- =====================================================================
-- End of 0061_profile_update_requests.sql
-- =====================================================================
