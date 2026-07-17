-- =====================================================================
-- KapitPondo — Migration 0020
-- QA fixes for M1 (Identity & Access):
--   1. Sysadmin rejection reasons were only ever written to
--      system_audit_log (admin-only) — the member had no way to see
--      why they were rejected. Store it on the member row too.
--   2. Registration never recorded consent to the Terms/Privacy Policy.
--      handle_new_auth_user() now copies it from auth signup metadata.
-- =====================================================================

alter table members
  add column if not exists verification_rejection_reason text,
  add column if not exists consent_version      text,
  add column if not exists consent_accepted_at  timestamptz;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.members (
    auth_id, email, phone, full_name, verification_status,
    consent_version, consent_accepted_at
  )
  values (
    new.id,
    coalesce(new.email, new.raw_user_meta_data->>'email'),
    new.phone,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, new.phone, ''), '@', 1)),
    'unverified',
    new.raw_user_meta_data->>'consent_version',
    case when new.raw_user_meta_data->>'consent_version' is not null then now() else null end
  )
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- End of 0020_verification_reason_and_consent.sql
-- =====================================================================
