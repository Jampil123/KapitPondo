-- =====================================================================
-- KapitPondo — 0071 No before-release review
-- Loans no longer get a second check between approval and release, for any
-- borrower. Supersedes 0070 (safe to run with or without it): the Treasurer
-- releases every loan, their own included, and the release is still verified
-- before it posts to the ledger.
--
--   Approve ─▶ Treasurer releases ─▶ verified (posted)
-- =====================================================================

create or replace function loan_duty_role(p_borrower_role text, p_duty text)
returns text language sql immutable as $$
  select case p_duty
    when 'approve' then case when p_borrower_role = 'owner'   then 'treasurer' else 'owner'   end
    when 'review'  then case when p_borrower_role = 'auditor' then 'treasurer' else 'auditor' end
    when 'release' then 'treasurer'
    when 'verify'  then case when p_borrower_role = 'auditor' then 'owner'     else 'auditor' end
  end;
$$;

create or replace function approve_loan(
  p_loan_id            uuid,
  p_approver_id        uuid,
  p_interest_rate      numeric,
  p_approved_principal numeric default null
)
returns loans
language plpgsql
security definer
as $$
declare
  v_loan          loans;
  v_cash          numeric(14,2);
  v_amount        numeric(14,2);
  v_borrower      uuid;
  v_borrower_role text;
  v_needed        text;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'pending' then raise exception 'Loan is not pending'; end if;

  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if p_approver_id = v_borrower then raise exception 'You cannot approve your own loan'; end if;
  v_borrower_role := member_group_role(v_loan.group_id, v_borrower);
  v_needed := loan_duty_role(v_borrower_role, 'approve');
  if member_group_role(v_loan.group_id, p_approver_id) is distinct from v_needed then
    raise exception 'This loan must be decided by the %', role_label(v_needed);
  end if;

  v_amount := coalesce(p_approved_principal, v_loan.principal);
  if v_amount > v_loan.principal then
    raise exception 'Approved amount (%) cannot exceed the requested principal (%)', v_amount, v_loan.principal;
  end if;

  select group_available_cash(v_loan.group_id) into v_cash;
  if v_cash < v_amount then
    raise exception 'Insufficient liquidity: available cash (%) is less than the approved amount (%)', v_cash, v_amount;
  end if;

  update loans set
    status             = 'approved',
    interest_rate      = p_interest_rate,
    approved_principal = v_amount,
    approved_by        = p_approver_id,
    approved_at        = now(),
    -- No before-release review: an approved loan goes straight to release.
    review_required    = false,
    reviewed_by        = null,
    reviewed_at        = null,
    review_note        = null,
    updated_at         = now()
  where id = p_loan_id
  returning * into v_loan;

  return v_loan;
end;
$$;

create or replace function disburse_loan(p_loan_id uuid, p_disburser_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_loan          loans;
  v_cash          numeric(14,2);
  v_amount        numeric(14,2);
  v_borrower      uuid;
  v_borrower_role text;
  v_needed        text;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'approved' then raise exception 'Loan is not approved'; end if;

  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  v_borrower_role := member_group_role(v_loan.group_id, v_borrower);
  -- Only the Treasurer releases their own loan; the verification is the check on it.
  if p_disburser_id = v_borrower and v_borrower_role is distinct from 'treasurer' then
    raise exception 'You cannot release your own loan';
  end if;
  v_needed := loan_duty_role(v_borrower_role, 'release');
  if member_group_role(v_loan.group_id, p_disburser_id) is distinct from v_needed then
    raise exception 'This loan must be released by the %', role_label(v_needed);
  end if;

  v_amount := coalesce(v_loan.approved_principal, v_loan.principal);
  select group_available_cash(v_loan.group_id) into v_cash;
  if v_cash < v_amount then
    raise exception 'Insufficient liquidity: available cash (%) is less than the approved amount (%)', v_cash, v_amount;
  end if;

  update loans set
    status              = 'active',
    outstanding_balance = v_amount,
    disbursed_by        = p_disburser_id,
    disbursed_at        = now(),
    updated_at          = now()
  where id = p_loan_id;

  return null;
end;
$$;

-- Approved loans still waiting on a review go straight to release.
update loans set review_required = false, updated_at = now()
where status = 'approved' and review_required and reviewed_at is null;
