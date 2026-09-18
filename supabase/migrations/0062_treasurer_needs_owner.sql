-- =====================================================================
-- KapitPondo — Migration 0062
-- Policy change: the Treasurer normally verifies members' contributions
-- and loan repayments, so they must not verify their OWN — but migrations
-- 0044/0045 routed a Treasurer-recorded contribution/repayment to the
-- Auditor specifically. That's still "an officer other than the Treasurer,"
-- not the Organizer. Per the updated requirement, a Treasurer-recorded
-- contribution or loan repayment (whether it's their own self-submission or
-- a walk-in they recorded for someone else — same "recorder's role, not
-- just is_walk_in" scoping as before) must now be confirmed by the OWNER
-- (the "Organizer" in this app's UI) instead of the Auditor.
--
-- Only these two functions change. approve_expense (migration 0046) still
-- requires the Auditor — expenses weren't part of this requirement, and
-- changing it wasn't requested.
-- =====================================================================

create or replace function approve_contribution(
  p_contribution_id uuid,
  p_approver_id     uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_contrib       contributions;
  v_ledger        ledger_entries;
  v_recorder_role text;
  v_approver_role text;
begin
  select * into v_contrib from contributions where id = p_contribution_id;
  if not found then
    raise exception 'Contribution not found';
  end if;

  if v_contrib.recorded_by = p_approver_id then
    raise exception 'You cannot approve a contribution you recorded';
  end if;

  if v_contrib.recorded_by is not null then
    select role into v_recorder_role
    from memberships
    where member_id = v_contrib.recorded_by and group_id = v_contrib.group_id;
  end if;

  if v_recorder_role = 'treasurer' then
    select role into v_approver_role
    from memberships
    where member_id = p_approver_id and group_id = v_contrib.group_id;

    if v_approver_role <> 'owner' then
      raise exception 'A contribution the Treasurer recorded must be confirmed by the Organizer';
    end if;
  end if;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_contrib.group_id, v_contrib.membership_id, v_contrib.cycle_id,
    'contribution', 'credit', v_contrib.amount,
    'contribution', v_contrib.id, p_approver_id
  ) returning * into v_ledger;

  update contributions set
    status          = 'approved',
    approved_by     = p_approver_id,
    paid_date       = current_date,
    ledger_entry_id = v_ledger.id,
    updated_at      = now()
  where id = p_contribution_id;

  return v_ledger;
end;
$$;

create or replace function confirm_loan_repayment(
  p_payment_id  uuid,
  p_approver_id uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_payment       loan_payments;
  v_loan          loans;
  v_ledger        ledger_entries;
  v_interest      numeric(14,2);
  v_principal     numeric(14,2);
  v_recorder_role text;
  v_approver_role text;
begin
  select * into v_payment from loan_payments where id = p_payment_id;
  if not found then raise exception 'Repayment not found'; end if;
  if v_payment.status <> 'submitted'::loan_payment_status then
    raise exception 'Repayment is not pending confirmation';
  end if;
  if v_payment.recorded_by = p_approver_id then
    raise exception 'Approver cannot be the same person as the recorder';
  end if;

  select * into v_loan from loans where id = v_payment.loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active'::loan_status, 'approved'::loan_status) then
    raise exception 'Loan is not active (status: %)', v_loan.status;
  end if;

  if v_payment.recorded_by is not null then
    select role into v_recorder_role
    from memberships
    where member_id = v_payment.recorded_by and group_id = v_loan.group_id;
  end if;

  if v_recorder_role = 'treasurer' then
    select role into v_approver_role
    from memberships
    where member_id = p_approver_id and group_id = v_loan.group_id;

    if v_approver_role <> 'owner' then
      raise exception 'A repayment the Treasurer recorded must be confirmed by the Organizer';
    end if;
  end if;

  v_interest  := least(round(v_loan.outstanding_balance * v_loan.interest_rate, 2), v_payment.amount);
  v_principal := least(v_payment.amount - v_interest, v_loan.outstanding_balance);

  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_loan.group_id, v_loan.membership_id,
    'loan_repayment'::ledger_entry_type, 'credit'::ledger_direction, v_payment.amount,
    'loan', v_loan.id, p_approver_id
  ) returning * into v_ledger;

  update loan_payments set
    principal_portion = v_principal,
    interest_portion  = v_interest,
    status             = 'paid'::loan_payment_status,
    approved_by        = p_approver_id,
    ledger_entry_id    = v_ledger.id,
    paid_date          = current_date,
    updated_at         = now()
  where id = p_payment_id;

  update loans set
    outstanding_balance = greatest(outstanding_balance - v_principal, 0),
    status               = case
                              when outstanding_balance - v_principal <= 0 then 'paid'::loan_status
                              else 'active'::loan_status
                            end,
    updated_at           = now()
  where id = v_loan.id;

  return v_ledger;
end;
$$;

-- =====================================================================
-- End of 0062_treasurer_needs_owner.sql
-- =====================================================================
