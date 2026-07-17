-- =====================================================================
-- KapitPondo — Migration 0021
-- QA fix for M3 (Membership), TC-008: rejecting a join request used to
-- hard-delete the membership row and silently discard the reason — the
-- requester never saw a "Rejected" status or why. There was also no
-- 'rejected' value in membership_status to keep the row around.
-- =====================================================================

alter type membership_status add value if not exists 'rejected';

alter table memberships
  add column if not exists rejection_reason text;

-- =====================================================================
-- End of 0021_membership_rejection_status.sql
-- =====================================================================
