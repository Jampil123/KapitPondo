-- ── Walk-in contribution direct confirmation ────────────────────────
-- When an officer (treasurer/auditor/owner) records a contribution on
-- behalf of a WALK-IN member (cash/GCash paid in person — see TC-018,
-- contributions.routes.js), the officer already physically confirmed the
-- payment by receiving it — there's no separate claim to verify the way
-- there is for a member's own self-submission. That case should post
-- straight to the ledger instead of sitting in the pending-approval queue.
--
-- contrib_segregation existed to stop one person unilaterally recording AND
-- approving the same contribution (anti-fraud control for the normal
-- member-submits / officer-approves flow). A walk-in recording is a
-- different case — the "recorder" and "approver" are the same act by
-- design, not a bypassed check — so it's flagged explicitly via
-- `is_walk_in` rather than silently relaxing the constraint for everyone.

alter table contributions add column if not exists is_walk_in boolean not null default false;

alter table contributions drop constraint if exists contrib_segregation;
alter table contributions add constraint contrib_segregation
  check (approved_by is null or recorded_by is null or approved_by <> recorded_by or is_walk_in);

-- ── record_walkin_contribution ───────────────────────────────────────
-- Atomically inserts an already-approved contribution + its ledger credit
-- in one transaction, mirroring approve_contribution()'s ledger-posting
-- shape but skipping the separate-approver step entirely.
create or replace function record_walkin_contribution(
  p_membership_id     uuid,
  p_cycle_id          uuid,
  p_group_id          uuid,
  p_amount            numeric,
  p_payment_method    payment_method,
  p_external_reference text,
  p_officer_id        uuid
)
returns contributions
language plpgsql
security definer
as $$
declare
  v_contrib contributions;
  v_ledger  ledger_entries;
begin
  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, posted_by
  ) values (
    p_group_id, p_membership_id, p_cycle_id,
    'contribution', 'credit', p_amount,
    'contribution', p_officer_id
  ) returning * into v_ledger;

  insert into contributions (
    membership_id, cycle_id, group_id, amount,
    payment_method, external_reference,
    recorded_by, approved_by, is_walk_in,
    status, paid_date, ledger_entry_id
  ) values (
    p_membership_id, p_cycle_id, p_group_id, p_amount,
    p_payment_method, p_external_reference,
    p_officer_id, p_officer_id, true,
    'approved', current_date, v_ledger.id
  ) returning * into v_contrib;

  -- Backfill source_id now that the contribution row exists (it's the
  -- ledger entry's own referent, same pattern as approve_contribution).
  update ledger_entries set source_id = v_contrib.id where id = v_ledger.id;

  return v_contrib;
end;
$$;
