-- =====================================================================
-- KapitPondo — Migration 0056
-- Segregation of duties for the group's GCash channel: the Treasurer
-- proposes a number (they're the one who'd actually receive the money),
-- the Owner reviews and approves it before members ever see it on the
-- contribution page. treasurer_gcash_number/name (0055) stay the LIVE,
-- member-visible values — only ever written by approveGcashProposal, never
-- edited directly by the Owner. The columns here track the one proposal
-- "in flight" at a time; full history lives in audit_log (entity_type
-- 'group_gcash'), not a separate table.
-- =====================================================================

alter table groups add column if not exists treasurer_gcash_status text not null default 'unset';
alter table groups drop constraint if exists groups_treasurer_gcash_status_check;
alter table groups add constraint groups_treasurer_gcash_status_check
  check (treasurer_gcash_status in ('unset', 'pending', 'approved', 'rejected'));

alter table groups add column if not exists treasurer_gcash_pending_number text;
alter table groups add column if not exists treasurer_gcash_pending_name text;
alter table groups add column if not exists treasurer_gcash_note text;
alter table groups add column if not exists treasurer_gcash_rejection_reason text;
alter table groups add column if not exists treasurer_gcash_submitted_by uuid references members(id);
alter table groups add column if not exists treasurer_gcash_submitted_at timestamptz;
alter table groups add column if not exists treasurer_gcash_reviewed_by uuid references members(id);
alter table groups add column if not exists treasurer_gcash_reviewed_at timestamptz;

-- =====================================================================
-- End of 0056_treasurer_gcash_approval.sql
-- =====================================================================
