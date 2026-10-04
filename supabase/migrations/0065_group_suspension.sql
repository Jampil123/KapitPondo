-- =====================================================================
-- KapitPondo — Migration 0065
-- Platform-level Fund Group suspension.
--
-- The System Administrator may suspend a whole fund group when there is a
-- documented system-policy violation. A suspended group is read-only for
-- everyone in it (middleware/requireGroupRole.js refuses every change) until
-- the administrator reinstates it. Its money and records are untouched —
-- suspension freezes activity, it never edits the ledger.
--
-- Separate from groups.status ('active' / 'archived'), which is the
-- Organizer's own lifecycle for the group. Like account suspension
-- (migration 0057), reinstating clears all three columns, so "suspended"
-- is simply suspended_at is not null.
-- =====================================================================

alter table groups add column if not exists suspended_at      timestamptz;
alter table groups add column if not exists suspended_by      uuid references members(id);
alter table groups add column if not exists suspension_reason text;

create index if not exists idx_groups_suspended on groups (suspended_at) where suspended_at is not null;

notify pgrst, 'reload schema';

-- =====================================================================
-- End of 0065_group_suspension.sql
-- =====================================================================
