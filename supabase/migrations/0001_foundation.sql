-- =====================================================================
-- KapitPondo — 0001 Foundation
-- Extensions, enum types, shared trigger functions and default grants.
--
-- Design principles (apply to every file that follows):
--   * Money is numeric(14,2); rates are numeric(6,4) (0.0300 = 3%).
--   * Claim tables (contributions, loan_payments, loans, penalties,
--     distribution_allocations) carry the workflow, proof and actors.
--     ledger_entries is APPEND-ONLY: a row is written only once a claim
--     is fully verified, and corrections are reversing entries.
--   * Segregation of duties: nobody confirms, verifies or approves a
--     record they recorded or paid themselves.
--   * The API uses the service_role key for every write. The mobile app
--     only reads, filtered by RLS (see 0015_security.sql).
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid(), crypt()

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
create type member_verification_status as enum (
  'unverified', 'pending', 'verified',
  'resubmission_required',   -- "Requires Re-submission": fixable, member submits again
  'rejected'                 -- final
);
create type group_status               as enum ('active', 'archived');
-- owner = "Organizer" in the UI
create type membership_role            as enum ('owner', 'treasurer', 'auditor', 'member');
create type membership_status          as enum ('pending', 'active', 'suspended', 'exited', 'rejected');
create type cycle_status               as enum ('draft', 'active', 'closed');
create type account_type               as enum ('savings', 'share_capital');
create type ledger_direction           as enum ('credit', 'debit');  -- credit = into fund/member; debit = out
-- 'expense' stays for reporting code that sums it; nothing posts it any more.
create type ledger_entry_type          as enum (
  'contribution', 'loan_disbursement', 'loan_repayment', 'distribution',
  'expense', 'penalty', 'fee', 'adjustment', 'reversal'
);
create type payment_method             as enum ('gcash', 'cash', 'bank_transfer', 'other');
create type contribution_status        as enum ('pending', 'submitted', 'approved', 'rejected', 'late', 'confirmed');
create type loan_status                as enum (
  'pending', 'approved', 'active', 'paid', 'rejected', 'defaulted', 'cancelled'
);
create type loan_payment_status        as enum (
  'scheduled', 'submitted', 'approved', 'paid', 'late', 'partial', 'rejected', 'confirmed'
);
create type distribution_status        as enum ('draft', 'previewed', 'finalized', 'verified');
create type penalty_status             as enum ('pending', 'waived', 'paid');
create type reversal_request_status    as enum ('pending_verification', 'verified', 'rejected', 'finalized');
create type message_channel            as enum ('officers', 'general');
create type announcement_type          as enum ('reminder', 'meeting', 'cycle', 'urgent');
create type announcement_audience      as enum ('all', 'unpaid', 'officers');

-- ---------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create or replace function prevent_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only; create a reversing entry instead of editing or deleting';
end; $$;

create or replace function prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The audit log is append-only';
end;
$$;

-- ---------------------------------------------------------------------
-- Default grants. Tables are reachable through PostgREST, but RLS (0015)
-- decides what anon/authenticated can actually see; they get no write
-- policies, so only service_role (the API) writes.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
