-- =====================================================================
-- KapitPondo — 0072 Organizer hand-over (UC-GM-10)
-- The Organizer role moves by request: the Organizer (or the Sysadmin, A1)
-- names an Active, Verified member who isn't an officer, with a reason; the
-- member accepts or declines. The Organizer keeps the role until they accept.
-- Requests expire after 7 days (checked when read — no scheduler here).
--
-- Also E6: an Organizer's own loan is decided by the Auditor (the Treasurer
-- when the group has no Auditor), so a member who becomes Organizer with a
-- loan request still pending can't decide it themselves.
-- =====================================================================

create table organizer_handovers (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  from_member_id    uuid references members(id),            -- the Organizer when it was sent
  to_member_id      uuid not null references members(id),
  reason            text not null check (length(trim(reason)) > 0),
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  requested_by      uuid not null references members(id),   -- the Organizer, or the Sysadmin (A1)
  by_sysadmin       boolean not null default false,
  problem_report_id uuid references problem_reports(id),
  expires_at        timestamptz not null default now() + interval '7 days',
  responded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index organizer_handovers_one_pending on organizer_handovers (group_id) where status = 'pending';
create index idx_organizer_handovers_to on organizer_handovers (to_member_id, status);

create trigger trg_organizer_handovers_updated before update on organizer_handovers
  for each row execute function set_updated_at();

-- Read and written only through the API (service role).
alter table organizer_handovers enable row level security;

-- Accepting: the chosen member becomes Organizer, every current Organizer
-- becomes a regular member, all in one transaction.
create or replace function accept_organizer_handover(p_handover_id uuid, p_member_id uuid)
returns organizer_handovers
language plpgsql
security definer
as $$
declare
  v_h      organizer_handovers;
  v_target memberships;
begin
  select * into v_h from organizer_handovers where id = p_handover_id for update;
  if not found then raise exception 'Hand-over request not found'; end if;
  if v_h.to_member_id <> p_member_id then raise exception 'This request is not addressed to you'; end if;
  if v_h.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
  if v_h.expires_at < now() then
    update organizer_handovers set status = 'expired' where id = v_h.id;
    raise exception 'This request has expired';
  end if;

  select ms.* into v_target from memberships ms
  where ms.group_id = v_h.group_id and ms.member_id = p_member_id for update;
  if not found or v_target.status <> 'active' then raise exception 'You are no longer an active member of this group'; end if;
  if v_target.role <> 'member' then raise exception 'An officer cannot also be the Organizer'; end if;
  if (select verification_status from members where id = p_member_id) is distinct from 'verified' then
    raise exception 'Your account must be verified to become the Organizer';
  end if;

  update memberships set role = 'member'
  where group_id = v_h.group_id and role = 'owner' and member_id <> p_member_id;
  update memberships set role = 'owner' where id = v_target.id;
  update groups set owner_id = p_member_id where id = v_h.group_id;

  update organizer_handovers set status = 'accepted', responded_at = now()
  where id = v_h.id returning * into v_h;
  return v_h;
end;
$$;

revoke execute on function accept_organizer_handover(uuid, uuid) from public, anon, authenticated;
grant execute on function accept_organizer_handover(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- E6: the Auditor decides an Organizer's own loan.
-- ---------------------------------------------------------------------

create or replace function loan_duty_role(p_borrower_role text, p_duty text)
returns text language sql immutable as $$
  select case p_duty
    when 'approve' then case when p_borrower_role = 'owner'   then 'auditor'   else 'owner'   end
    when 'review'  then case when p_borrower_role = 'auditor' then 'treasurer' else 'auditor' end
    when 'release' then 'treasurer'
    when 'verify'  then case when p_borrower_role = 'auditor' then 'owner'     else 'auditor' end
  end;
$$;

-- Who decides a loan in this group: loan_duty_role, except an Organizer's
-- loan falls back to the Treasurer when there's no active Auditor.
create or replace function loan_approver_role(p_group_id uuid, p_borrower_role text)
returns text language sql stable security definer as $$
  select case
    when p_borrower_role = 'owner' and not exists (
      select 1 from memberships where group_id = p_group_id and role = 'auditor' and status = 'active'
    ) then 'treasurer'
    else loan_duty_role(p_borrower_role, 'approve')
  end;
$$;

-- Same as 0071 (no before-release review), deciding role from loan_approver_role.
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
  v_needed := loan_approver_role(v_loan.group_id, v_borrower_role);
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
