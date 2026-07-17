-- =====================================================================
-- KapitPondo — Migration 0024
-- QA fix for M4 (Fund Cycle), TC-011: cycle setup couldn't capture a
-- contribution due day, a default loan interest rate, a minimum loan
-- amount, or an early-termination penalty — none of these existed on
-- `cycles` at all.
-- =====================================================================

alter table cycles
  add column if not exists contribution_due_day     int check (contribution_due_day between 1 and 31),
  add column if not exists default_interest_rate    numeric(6,4) check (default_interest_rate >= 0),
  add column if not exists minimum_loan_amount       numeric(14,2) check (minimum_loan_amount >= 0),
  add column if not exists early_termination_penalty numeric(14,2) check (early_termination_penalty >= 0);

-- =====================================================================
-- End of 0024_cycle_fields.sql
-- =====================================================================
