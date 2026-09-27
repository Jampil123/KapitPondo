-- =====================================================================
-- KapitPondo — 0002 Identity & platform
-- Member accounts (1:1 with Supabase auth), KYC, platform admins and
-- per-member housekeeping tables.
-- =====================================================================

-- Platform-level user account and KYC profile.
create table members (
  id                            uuid primary key default gen_random_uuid(),
  auth_id                       uuid unique references auth.users(id) on delete cascade,

  -- name & contact
  full_name                     text not null,
  first_name                    text,
  middle_name                   text,
  last_name                     text,
  birthday                      text,
  sex                           text,
  email                         text,
  phone                         text,
  avatar_url                    text,

  -- address & KYC profile
  nationality                   text,
  region                        text,
  province                      text,
  city                          text,
  barangay                      text,
  street_address                text,
  zip_code                      text,
  source_of_funds               text,
  employment_status             text,
  occupation                    text,

  -- current verification state; each ID submission and its review lives in
  -- identity_submissions
  verification_status           member_verification_status not null default 'unverified',
  verified_at                   timestamptz,

  -- consent & preferences
  consent_version               text,
  consent_accepted_at           timestamptz,
  notification_preferences      jsonb not null default
    '{"payments":true,"loans":true,"group_announcements":true,"direct_messages":true,"account_security":true}'::jsonb,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create trigger trg_members_updated before update on members
  for each row execute function set_updated_at();

-- One row per ID submission (KYC attempt). A resubmission adds a new row,
-- so earlier attempts and the reasons they were turned down are kept.
create table identity_submissions (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid not null references members(id) on delete cascade,
  id_type              text,
  id_number            text,
  id_document_url      text not null,   -- front; a path in the id-documents bucket
  id_document_back_url text,
  id_document_qr_data  text,
  selfie_url           text,
  status               member_verification_status not null default 'pending'
    check (status in ('pending', 'verified', 'resubmission_required', 'rejected')),
  reason               text,            -- why it needs re-submission or was rejected
  submitted_at         timestamptz not null default now(),
  reviewed_by          uuid references members(id),
  reviewed_at          timestamptz
);
create index idx_identity_submissions_member on identity_submissions (member_id, submitted_at desc);
-- At most one submission in review per member.
create unique index one_pending_identity_submission on identity_submissions (member_id) where status = 'pending';

-- Platform administrators, keyed by auth user.
create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  active     boolean not null default true
);

-- Actions taken by platform admins (account verified / rejected, ...).
create table system_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id),   -- the sysadmin who acted
  action      text not null,                    -- e.g. 'account.verified'
  target_type text not null,                    -- e.g. 'account'
  target_id   uuid,                             -- the affected user id
  metadata    jsonb,                            -- { reason, before, after, ... }
  created_at  timestamptz not null default now()
);
create index system_audit_log_created_idx on system_audit_log (created_at desc);

-- Hashed recovery questions for admin accounts.
create table admin_security_questions (
  member_id     uuid primary key references members(id) on delete cascade,
  question_1    text not null,
  answer_1_hash text not null,
  question_2    text not null,
  answer_2_hash text not null,
  updated_at    timestamptz not null default now()
);

-- Expo push tokens, one row per device.
create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  token      text not null unique,
  platform   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_push_tokens_member on push_tokens (member_id);

-- Sign-in history per device.
create table login_activity (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  device_label text,
  platform     text,
  app_version  text,
  created_at   timestamptz not null default now()
);
create index idx_login_activity_member_created on login_activity (member_id, created_at desc);

-- In-app feedback.
create table feedback (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  category    text not null check (category in ('bug', 'feature', 'general', 'other')),
  message     text not null,
  app_version text,
  platform    text,
  created_at  timestamptz not null default now()
);
create index idx_feedback_member_created on feedback (member_id, created_at desc);

-- Requests to change a locked profile field, reviewed by a platform admin.
create table profile_update_requests (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null references members(id) on delete cascade,
  field                   text not null check (field in (
    'first_name', 'middle_name', 'last_name', 'birthday', 'nationality',
    'region', 'province', 'city', 'barangay', 'street_address', 'zip_code',
    'source_of_funds', 'employment_status', 'occupation'
  )),
  current_value           text,
  new_value               text not null,
  reason                  text not null check (reason in ('typo', 'legal_name_change', 'other')),
  details                 text,
  proof_url               text,
  requires_reverification boolean not null default false,
  status                  text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- auth.users.id of the reviewing sysadmin — deliberately not a members.id,
  -- so no foreign key.
  reviewed_by             uuid,
  reviewed_at             timestamptz,
  rejection_reason        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index idx_profile_update_requests_member_created on profile_update_requests (member_id, created_at desc);
