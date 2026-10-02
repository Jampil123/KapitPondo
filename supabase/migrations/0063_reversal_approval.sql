-- =====================================================================
-- KapitPondo — 0063 Reversal: Treasurer starts, Auditor verifies,
-- Organizer approves (UC-LG-01..03)
--
-- A posted entry is never edited or deleted. Approving a reversal posts a
-- linked opposite entry AND undoes the record behind it, so the correct
-- payment can go through the normal flow again:
--   contribution  → back to 'rejected' (the member can pay again)
--   loan payment  → 'rejected', and its principal goes back on the loan
--   loan release  → the loan goes back to 'approved', awaiting release
--   penalty       → back to 'pending'
-- Either reviewer can reject with a reason; nothing is posted then.
-- =====================================================================

alter table ledger_reversal_requests add column if not exists rejected_by   uuid references members(id);
alter table ledger_reversal_requests add column if not exists rejected_at   timestamptz;
alter table ledger_reversal_requests add column if not exists reject_reason text;

-- Why this entry can't be reversed, or null if it can.
create or replace function reversal_block(p_entry_id uuid)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_e ledger_entries;
begin
  select * into v_e from ledger_entries where id = p_entry_id;
  if not found then return 'Ledger entry not found'; end if;
  if v_e.entry_type = 'reversal' then return 'A reversal can''t be reversed'; end if;
  if v_e.entry_type in ('distribution', 'withdrawal') then
    return 'Year-end shares and withdrawal payouts can''t be reversed';
  end if;
  if exists (select 1 from ledger_entries where reverses_entry_id = p_entry_id) then
    return 'This entry has already been reversed';
  end if;
  if v_e.entry_type = 'loan_disbursement' and v_e.source_type = 'loan' and exists (
    select 1 from loan_payments p where p.loan_id = v_e.source_id and p.status in ('paid', 'approved', 'submitted', 'confirmed')
  ) then
    return 'This loan already has repayments. Reverse those first.';
  end if;
  return null;
end;
$$;

create or replace function approve_reversal(p_request_id uuid, p_actor_id uuid)
returns ledger_reversal_requests
language plpgsql security definer
set search_path = public
as $$
declare
  v_r        ledger_reversal_requests;
  v_e        ledger_entries;
  v_block    text;
  v_reversal ledger_entries;
  v_payment  loan_payments;
begin
  select * into v_r from ledger_reversal_requests where id = p_request_id for update;
  if not found then raise exception 'Reversal request not found'; end if;
  if v_r.status <> 'verified' then raise exception 'This reversal is not waiting for approval'; end if;
  if member_group_role(v_r.group_id, p_actor_id) is distinct from 'owner' then
    raise exception 'Only the Organizer can approve a reversal';
  end if;
  if p_actor_id in (v_r.initiated_by, v_r.verified_by) then
    raise exception 'The person who started or verified a reversal cannot also approve it';
  end if;

  select * into v_e from ledger_entries where id = v_r.entry_id;
  v_block := reversal_block(v_r.entry_id);
  if v_block is not null then raise exception '%', v_block; end if;

  v_reversal := reverse_ledger_entry(v_r.entry_id, v_r.reason, p_actor_id);

  -- Undo the record behind the entry.
  if v_e.source_type = 'contribution' and v_e.entry_type = 'contribution' then
    update contributions set status = 'rejected', rejection_reason = 'Reversed: ' || v_r.reason, updated_at = now()
    where id = v_e.source_id;

  elsif v_e.entry_type = 'loan_repayment' then
    select * into v_payment from loan_payments
    where (v_e.source_type = 'loan_payment' and id = v_e.source_id) or ledger_entry_id = v_e.id
    limit 1;
    if found then
      update loan_payments set status = 'rejected', rejection_reason = 'Reversed: ' || v_r.reason, updated_at = now()
      where id = v_payment.id;
      update loans set
        outstanding_balance = outstanding_balance + v_payment.principal_portion,
        status = case when status = 'paid' then 'active'::loan_status else status end,
        updated_at = now()
      where id = v_payment.loan_id;
    end if;

  elsif v_e.entry_type = 'loan_disbursement' and v_e.source_type = 'loan' then
    update loans set
      status = 'approved', outstanding_balance = 0,
      disbursed_by = null, disbursed_at = null, disbursed_ledger_entry_id = null,
      release_verified_by = null, release_verified_at = null,
      updated_at = now()
    where id = v_e.source_id;

  elsif v_e.entry_type = 'penalty' and v_e.source_type = 'penalty' then
    update penalties set status = 'pending', ledger_entry_id = null, updated_at = now()
    where id = v_e.source_id;
  end if;

  update ledger_reversal_requests set
    status = 'finalized', finalized_by = p_actor_id, finalized_at = now(),
    reversal_entry_id = v_reversal.id, updated_at = now()
  where id = p_request_id
  returning * into v_r;
  return v_r;
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('approve_reversal', 'reversal_block')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger_reversal_requests') then
    alter publication supabase_realtime add table ledger_reversal_requests;
  end if;
end $$;
