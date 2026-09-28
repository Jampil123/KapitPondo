-- =====================================================================
-- KapitPondo — Migration 0057
-- Platform-level account suspension.
--
-- Distinct from memberships.status = 'suspended', which is a group officer
-- suspending someone inside one fund group (migration 0001). This is the
-- System Administrator withdrawing platform access altogether, and it is
-- orthogonal to verification_status — a verified account can be suspended
-- without losing the fact that its ID was verified.
--
-- Reinstating clears all three columns, so "suspended" is simply
-- suspended_at is not null.
-- =====================================================================

alter table members add column if not exists suspended_at      timestamptz;
alter table members add column if not exists suspended_by      uuid references members(id);
alter table members add column if not exists suspension_reason text;

create index if not exists idx_members_suspended on members (suspended_at) where suspended_at is not null;

notify pgrst, 'reload schema';

-- =====================================================================
-- End of 0057_account_suspension.sql
-- =====================================================================
