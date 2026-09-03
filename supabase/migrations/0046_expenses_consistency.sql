-- =====================================================================
-- KapitPondo — Migration 0046
-- Brings expenses up to the same standard contributions/loan repayments
-- just got (migrations 0044/0045), which expenses had never received:
--
--   1. rejection_reason — expenses had no way to record WHY something was
--      returned, unlike contributions/loan_payments which both have this.
--   2. Treasurer-recorded needs Auditor — approve_expense only ever checked
--      "not the recorder"; now a Treasurer-recorded expense specifically
--      needs the Auditor to approve, same rule as approve_contribution and
--      confirm_loan_repayment. Scoped to the recorder's role (not just
--      "any officer") so a lone Auditor recording their own expense isn't
--      stranded with no valid approver.
-- =====================================================================

alter table expenses add column if not exists rejection_reason text;

create or replace function approve_expense(
  p_expense_id  uuid,
  p_approver_id uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_expense       expenses;
  v_ledger        ledger_entries;
  v_cash          numeric(14,2);
  v_recorder_role text;
  v_approver_role text;
begin
  select * into v_expense from expenses where id = p_expense_id;
  if not found then raise exception 'Expense not found'; end if;

  if v_expense.recorded_by = p_approver_id then
    raise exception 'You cannot approve an expense you recorded';
  end if;

  if v_expense.recorded_by is not null then
    select role into v_recorder_role
    from memberships
    where member_id = v_expense.recorded_by and group_id = v_expense.group_id;
  end if;

  if v_recorder_role = 'treasurer' then
    select role into v_approver_role
    from memberships
    where member_id = p_approver_id and group_id = v_expense.group_id;

    if v_approver_role <> 'auditor' then
      raise exception 'An expense the Treasurer recorded must be confirmed by the Auditor';
    end if;
  end if;

  select group_available_cash(v_expense.group_id) into v_cash;
  if v_cash < v_expense.amount then
    raise exception 'Insufficient fund balance to cover this expense';
  end if;

  insert into ledger_entries (
    group_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_expense.group_id,
    'expense', 'debit', v_expense.amount,
    'expense', v_expense.id, p_approver_id
  ) returning * into v_ledger;

  update expenses set
    status          = 'approved',
    approved_by     = p_approver_id,
    ledger_entry_id = v_ledger.id,
    updated_at      = now()
  where id = p_expense_id;

  return v_ledger;
end;
$$;

-- =====================================================================
-- End of 0046_expenses_consistency.sql
-- =====================================================================
