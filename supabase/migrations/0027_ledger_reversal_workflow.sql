-- =====================================================================
-- KapitPondo — Migration 0027
-- QA fix for M7 (Ledger): reversing an entry was a single Owner-only action
-- with no review stage — TC-021 wants a Treasurer to be able to INITIATE a
-- correction, TC-026 wants an Auditor to VERIFY it, and both test cases
-- describe the Owner giving final approval before it actually posts. The
-- append-only ledger itself is untouched by this — the reversing entry is
-- only posted (via the existing reverse_ledger_entry RPC) once finalized.
-- =====================================================================

create type reversal_request_status as enum ('pending_verification', 'verified', 'rejected', 'finalized');

create table ledger_reversal_requests (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  entry_id          uuid not null references ledger_entries(id),
  reason            text not null,
  status            reversal_request_status not null default 'pending_verification',
  initiated_by      uuid not null references members(id),
  initiated_at      timestamptz not null default now(),
  verified_by       uuid references members(id),
  verified_at       timestamptz,
  verify_notes      text,
  finalized_by      uuid references members(id),
  finalized_at      timestamptz,
  reversal_entry_id uuid references ledger_entries(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_reversal_requests_group on ledger_reversal_requests (group_id);
create index idx_reversal_requests_entry on ledger_reversal_requests (entry_id);

-- =====================================================================
-- End of 0027_ledger_reversal_workflow.sql
-- =====================================================================
