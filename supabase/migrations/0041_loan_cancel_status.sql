-- =====================================================================
-- KapitPondo — Migration 0041
-- Adds 'cancelled' to loan_status so a member can withdraw their own
-- still-pending loan request. Kept distinct from 'rejected' (an Owner
-- decision) rather than reusing it with a special rejection_reason string —
-- the two are different events with different actors, and conflating them
-- would make "who cancelled this and why" ambiguous from the status alone.
--
-- ALTER TYPE ... ADD VALUE must be its own statement, not combined with
-- anything that uses the new value in the same transaction — this migration
-- does nothing else, so that's satisfied.
-- =====================================================================

alter type loan_status add value if not exists 'cancelled';

-- =====================================================================
-- End of 0041_loan_cancel_status.sql
-- =====================================================================
