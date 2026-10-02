-- =====================================================================
-- KapitPondo — 0058 Member money privacy
-- Members see group money as totals only (the API's /reports/fund-totals),
-- never another member's individual postings. Until now every per-member
-- money table was readable by any active member of the group, so a member
-- could read who paid what straight from the database, around the API.
--
-- Now: officers (Organizer, Treasurer, Auditor) read every row in their
-- group; a member reads only rows on their own membership. The app only
-- reads these tables for realtime refresh (0015), so a member's live
-- updates now fire on their own records only.
-- =====================================================================

-- Is this membership the signed-in member's own? SECURITY DEFINER so policies
-- can check it without memberships' own RLS getting in the way.
create or replace function public.owns_membership(p_membership_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where id = p_membership_id
      and member_id = public.current_member_id()
  )
$$;

revoke all on function public.owns_membership(uuid) from public;
grant execute on function public.owns_membership(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ledger_entries
-- ---------------------------------------------------------------------
drop policy if exists "ledger_entries: read as active member" on ledger_entries;
create policy "ledger_entries: officers read group, members read own"
  on ledger_entries for select to authenticated
  using (
    public.has_group_role(group_id, array['owner', 'treasurer', 'auditor'])
    or (membership_id is not null and public.owns_membership(membership_id) and public.has_group_role(group_id))
  );

-- ---------------------------------------------------------------------
-- contributions
-- ---------------------------------------------------------------------
drop policy if exists "contributions: read as active member" on contributions;
create policy "contributions: officers read group, members read own"
  on contributions for select to authenticated
  using (
    public.has_group_role(group_id, array['owner', 'treasurer', 'auditor'])
    or (public.owns_membership(membership_id) and public.has_group_role(group_id))
  );

-- ---------------------------------------------------------------------
-- penalties
-- ---------------------------------------------------------------------
drop policy if exists "penalties: read as active member" on penalties;
create policy "penalties: officers read group, members read own"
  on penalties for select to authenticated
  using (
    public.has_group_role(group_id, array['owner', 'treasurer', 'auditor'])
    or (public.owns_membership(membership_id) and public.has_group_role(group_id))
  );

-- ---------------------------------------------------------------------
-- loans & repayments
-- ---------------------------------------------------------------------
drop policy if exists "loans: read as active member" on loans;
create policy "loans: officers read group, members read own"
  on loans for select to authenticated
  using (
    public.has_group_role(group_id, array['owner', 'treasurer', 'auditor'])
    or (public.owns_membership(membership_id) and public.has_group_role(group_id))
  );

drop policy if exists "loan_payments: read as active member" on loan_payments;
create policy "loan_payments: officers read group, members read own"
  on loan_payments for select to authenticated
  using (exists (
    select 1 from loans l
    where l.id = loan_payments.loan_id
      and (
        public.has_group_role(l.group_id, array['owner', 'treasurer', 'auditor'])
        or (public.owns_membership(l.membership_id) and public.has_group_role(l.group_id))
      )
  ));

-- ---------------------------------------------------------------------
-- Year-end allocations (each member's share)
-- ---------------------------------------------------------------------
drop policy if exists "distribution_allocations: read as active member" on distribution_allocations;
create policy "distribution_allocations: officers read group, members read own"
  on distribution_allocations for select to authenticated
  using (exists (
    select 1 from distributions d
    where d.id = distribution_allocations.distribution_id
      and (
        public.has_group_role(d.group_id, array['owner', 'treasurer', 'auditor'])
        or (public.owns_membership(distribution_allocations.membership_id) and public.has_group_role(d.group_id))
      )
  ));

-- ---------------------------------------------------------------------
-- Reversal requests (they name the entry being reversed)
-- ---------------------------------------------------------------------
drop policy if exists "ledger_reversal_requests: read as active member" on ledger_reversal_requests;
create policy "ledger_reversal_requests: officers read group, members read own"
  on ledger_reversal_requests for select to authenticated
  using (
    public.has_group_role(group_id, array['owner', 'treasurer', 'auditor'])
    or exists (
      select 1 from ledger_entries e
      where e.id = ledger_reversal_requests.entry_id
        and e.membership_id is not null
        and public.owns_membership(e.membership_id)
        and public.has_group_role(ledger_reversal_requests.group_id)
    )
  );
