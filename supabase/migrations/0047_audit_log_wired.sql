-- =====================================================================
-- KapitPondo — Migration 0047
-- audit_log (migration 0001) was declared but never written to by any code
-- path, and had no read endpoint scoped to the group Auditor role — a dead
-- table. This wires it up for real:
--
--   actor_role — the role the actor held AT THE TIME of the action, not
--   their current role (which can change later and would misattribute
--   historical entries — e.g. someone demoted from Treasurer would show as
--   "Member" on an approval they made while they were Treasurer). Captured
--   by the application at insert time, not derived from a join.
--
-- Indexes support the real read pattern: a group's feed newest-first
-- (paginated by created_at), optionally filtered to one entity_type.
-- =====================================================================

alter table audit_log add column if not exists actor_role text;

create index if not exists idx_audit_log_group_created on audit_log (group_id, created_at desc);
create index if not exists idx_audit_log_group_entity on audit_log (group_id, entity_type, created_at desc);

-- =====================================================================
-- End of 0047_audit_log_wired.sql
-- =====================================================================
