-- =====================================================================
-- KapitPondo — Migration 0026
-- QA fix for M6 (Lending): approval and disbursement were one atomic RPC
-- callable by Treasurer OR Owner alone — no segregation between the
-- "lending decision" (documented as the Owner's sole authority) and the
-- Treasurer's disbursement of an already-approved loan (TC-013, TC-019).
-- Also adds approved_principal so a partial approval under insufficient
-- liquidity (TC-040) doesn't have to equal the full requested principal.
-- =====================================================================

alter table loans
  add column if not exists approved_principal numeric(14,2) check (approved_principal > 0),
  add column if not exists disbursed_by uuid references members(id),
  add column if not exists rejection_reason text;

drop function if exists approve_and_disburse_loan(uuid, uuid, numeric);

-- Owner-only: the lending decision. Sets the interest rate and (optionally,
-- for TC-040) a partial approved amount; checks eligibility's liquidity
-- component against THAT amount, not the full request. No ledger posting —
-- no cash has moved yet.
create or replace function approve_loan(
  p_loan_id           uuid,
  p_approver_id       uuid,
  p_interest_rate     numeric,
  p_approved_principal numeric default null
)
returns loans
language plpgsql
security definer
as $$
declare
  v_loan   loans;
  v_cash   numeric(14,2);
  v_amount numeric(14,2);
begin
  select * into v_loan from loans where id = p_loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'pending' then raise exception 'Loan is not pending'; end if;

  v_amount := coalesce(p_approved_principal, v_loan.principal);
  if v_amount > v_loan.principal then
    raise exception 'Approved amount (%) cannot exceed the requested principal (%)', v_amount, v_loan.principal;
  end if;

  select group_available_cash(v_loan.group_id) into v_cash;
  if v_cash < v_amount then
    raise exception 'Insufficient liquidity: available cash (%) is less than the approved amount (%)', v_cash, v_amount;
  end if;

  update loans set
    status              = 'approved',
    interest_rate        = p_interest_rate,
    approved_principal   = v_amount,
    approved_by          = p_approver_id,
    approved_at          = now(),
    updated_at           = now()
  where id = p_loan_id
  returning * into v_loan;

  return v_loan;
end;
$$;

-- Treasurer or Owner: disburses an already-approved loan. Liquidity is
-- re-checked here (cash may have moved since approval) — this is the step
-- that actually posts the ledger entry and moves cash.
create or replace function disburse_loan(
  p_loan_id      uuid,
  p_disburser_id uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_loan   loans;
  v_ledger ledger_entries;
  v_cash   numeric(14,2);
  v_amount numeric(14,2);
begin
  select * into v_loan from loans where id = p_loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'approved' then raise exception 'Loan is not approved'; end if;

  v_amount := coalesce(v_loan.approved_principal, v_loan.principal);

  select group_available_cash(v_loan.group_id) into v_cash;
  if v_cash < v_amount then
    raise exception 'Insufficient liquidity: available cash (%) is less than the approved amount (%)', v_cash, v_amount;
  end if;

  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_loan.group_id, v_loan.membership_id,
    'loan_disbursement', 'debit', v_amount,
    'loan', v_loan.id, p_disburser_id
  ) returning * into v_ledger;

  update loans set
    status                    = 'active',
    outstanding_balance        = v_amount,
    disbursed_by               = p_disburser_id,
    disbursed_ledger_entry_id  = v_ledger.id,
    disbursed_at               = now(),
    updated_at                 = now()
  where id = p_loan_id;

  return v_ledger;
end;
$$;

-- =====================================================================
-- End of 0026_loan_approval_disbursement_split.sql
-- =====================================================================
