-- =====================================================================
-- KapitPondo — 0011 Functions: contributions (money in)
-- submitted ──confirm──▶ confirmed ──verify──▶ posted to the ledger
--   * Confirm = the fund holder checks the money arrived (the Treasurer,
--     or the Organizer when the Treasurer is the payer).
--   * Verify  = the independent check that posts (the Auditor, or the
--     Organizer when the Auditor paid/recorded it or there is no Auditor).
--   * Nobody confirms/verifies money they paid or recorded, and nobody
--     does both steps on the same record.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Who may confirm / verify
-- ---------------------------------------------------------------------

-- Money in: the confirming role for a payer with this role.
create or replace function money_in_confirm_role(p_payer_role text)
returns text language sql immutable as $$
  select case when p_payer_role = 'treasurer' then 'owner' else 'treasurer' end;
$$;

-- Money in: the verifying role (the one that posts). The Organizer steps in
-- when the Auditor paid or recorded the money, or the group has no Auditor.
create or replace function money_in_verify_role(p_group_id uuid, p_payer_role text, p_recorder_role text default null)
returns text language sql stable security definer as $$
  select case
    when p_payer_role = 'auditor' or p_recorder_role = 'auditor' or not group_has_role(p_group_id, 'auditor') then 'owner'
    else 'auditor'
  end;
$$;

-- ---------------------------------------------------------------------
-- Two-step flow
-- ---------------------------------------------------------------------

create or replace function confirm_contribution(p_contribution_id uuid, p_confirmer_id uuid)
returns contributions
language plpgsql
security definer
as $$
declare
  v_c          contributions;
  v_payer      uuid;
  v_payer_role text;
  v_role       text;
  v_needed     text;
begin
  select * into v_c from contributions where id = p_contribution_id for update;
  if not found then raise exception 'Contribution not found'; end if;
  if v_c.status <> 'submitted' then raise exception 'Contribution is not waiting for confirmation'; end if;

  select member_id into v_payer from memberships where id = v_c.membership_id;
  if p_confirmer_id = v_payer then raise exception 'You cannot confirm your own contribution'; end if;
  if p_confirmer_id = v_c.recorded_by then raise exception 'You cannot confirm a contribution you recorded'; end if;

  v_payer_role := member_group_role(v_c.group_id, v_payer);
  v_role       := member_group_role(v_c.group_id, p_confirmer_id);
  v_needed     := money_in_confirm_role(v_payer_role);
  if v_role is distinct from v_needed then
    raise exception 'This contribution must be confirmed by the %', role_label(v_needed);
  end if;

  update contributions set
    status       = 'confirmed',
    confirmed_by = p_confirmer_id,
    confirmed_at = now(),
    updated_at   = now()
  where id = p_contribution_id
  returning * into v_c;
  return v_c;
end;
$$;

create or replace function verify_contribution(p_contribution_id uuid, p_verifier_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_c          contributions;
  v_ledger     ledger_entries;
  v_payer      uuid;
  v_payer_role text;
  v_role       text;
  v_needed     text;
begin
  select * into v_c from contributions where id = p_contribution_id for update;
  if not found then raise exception 'Contribution not found'; end if;
  if v_c.status <> 'confirmed' then raise exception 'Contribution is not waiting for verification'; end if;

  select member_id into v_payer from memberships where id = v_c.membership_id;
  if p_verifier_id = v_payer then raise exception 'You cannot verify your own contribution'; end if;
  if p_verifier_id = v_c.recorded_by then raise exception 'You cannot verify a contribution you recorded'; end if;
  if p_verifier_id = v_c.confirmed_by then raise exception 'The person who confirmed a contribution cannot also verify it'; end if;

  v_payer_role := member_group_role(v_c.group_id, v_payer);
  v_role       := member_group_role(v_c.group_id, p_verifier_id);
  v_needed     := money_in_verify_role(v_c.group_id, v_payer_role, member_group_role(v_c.group_id, v_c.recorded_by));
  if v_role is distinct from v_needed then
    raise exception 'This contribution must be verified by the %', role_label(v_needed);
  end if;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_c.group_id, v_c.membership_id, v_c.cycle_id,
    'contribution', 'credit', v_c.amount,
    'contribution', v_c.id, p_verifier_id
  ) returning * into v_ledger;

  update contributions set
    status          = 'approved',
    approved_by     = p_verifier_id,
    paid_date       = current_date,
    ledger_entry_id = v_ledger.id,
    updated_at      = now()
  where id = p_contribution_id;

  return v_ledger;
end;
$$;

-- Compatibility: the old single step now does whichever step is next.
-- Returns the ledger entry only when this call posted (the verify step).
create or replace function approve_contribution(p_contribution_id uuid, p_approver_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_status contribution_status;
begin
  select status into v_status from contributions where id = p_contribution_id;
  if not found then raise exception 'Contribution not found'; end if;
  if v_status = 'submitted' then
    perform confirm_contribution(p_contribution_id, p_approver_id);
    return null;
  end if;
  return verify_contribution(p_contribution_id, p_approver_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Walk-in (cash taken in person)
-- ---------------------------------------------------------------------

-- Walk-in: if the recorder is the person who'd confirm it, recording IS the
-- confirmation. Otherwise it waits in 'submitted' like any other claim.
create or replace function record_walk_in_contribution(p_contribution_id uuid, p_recorder_id uuid)
returns contributions
language plpgsql
security definer
as $$
declare
  v_c          contributions;
  v_payer      uuid;
begin
  select * into v_c from contributions where id = p_contribution_id for update;
  if not found then raise exception 'Contribution not found'; end if;
  if v_c.status <> 'submitted' then raise exception 'Contribution is not pending'; end if;
  if not v_c.is_walk_in or v_c.recorded_by is distinct from p_recorder_id then
    raise exception 'Only a walk-in recorded by this officer can be confirmed on recording';
  end if;

  select member_id into v_payer from memberships where id = v_c.membership_id;
  if v_payer <> p_recorder_id
     and member_group_role(v_c.group_id, p_recorder_id) = money_in_confirm_role(member_group_role(v_c.group_id, v_payer)) then
    update contributions set
      status       = 'confirmed',
      confirmed_by = p_recorder_id,
      confirmed_at = now(),
      updated_at   = now()
    where id = p_contribution_id
    returning * into v_c;
  end if;
  return v_c;
end;
$$;

create or replace function post_walk_in_contribution(p_contribution_id uuid, p_recorder_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
begin
  perform record_walk_in_contribution(p_contribution_id, p_recorder_id);
  return null;
end;
$$;

create or replace function record_walkin_contribution(
  p_membership_id      uuid,
  p_cycle_id           uuid,
  p_group_id           uuid,
  p_amount             numeric,
  p_payment_method     payment_method,
  p_external_reference text,
  p_officer_id         uuid,
  p_proof_url          text default null
)
returns contributions
language plpgsql
security definer
as $$
declare
  v_contrib contributions;
  v_ledger  ledger_entries;
begin
  insert into contributions (
    membership_id, cycle_id, group_id, amount,
    payment_method, external_reference, proof_url,
    recorded_by, approved_by, is_walk_in,
    status, paid_date
  ) values (
    p_membership_id, p_cycle_id, p_group_id, p_amount,
    p_payment_method, p_external_reference, p_proof_url,
    p_officer_id, p_officer_id, true,
    'approved', current_date
  ) returning * into v_contrib;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    p_group_id, p_membership_id, p_cycle_id,
    'contribution', 'credit', p_amount,
    'contribution', v_contrib.id, p_officer_id
  ) returning * into v_ledger;

  update contributions set ledger_entry_id = v_ledger.id where id = v_contrib.id
  returning * into v_contrib;

  return v_contrib;
end;
$$;

-- ---------------------------------------------------------------------
-- Penalties
-- ---------------------------------------------------------------------

create or replace function settle_contribution_penalties(
  p_contribution_id uuid,
  p_approver_id     uuid
)
returns setof penalties
language plpgsql
security definer
as $$
declare
  v_contrib contributions;
  v_penalty penalties;
  v_ledger  ledger_entries;
begin
  select * into v_contrib from contributions where id = p_contribution_id;
  if not found then raise exception 'Contribution not found'; end if;
  if v_contrib.status <> 'approved' then
    raise exception 'Contribution is not approved';
  end if;

  for v_penalty in
    select * from penalties
    where paid_with_contribution_id = p_contribution_id and status = 'pending' and amount > 0
    for update
  loop
    insert into ledger_entries (
      group_id, membership_id, cycle_id,
      entry_type, direction, amount,
      source_type, source_id, description, posted_by
    ) values (
      v_penalty.group_id, v_penalty.membership_id, v_penalty.cycle_id,
      'penalty', 'credit', v_penalty.amount,
      'penalty', v_penalty.id, v_penalty.reason, p_approver_id
    ) returning * into v_ledger;

    update penalties set
      status          = 'paid',
      ledger_entry_id = v_ledger.id,
      updated_at      = now()
    where id = v_penalty.id
    returning * into v_penalty;

    return next v_penalty;
  end loop;
end;
$$;
