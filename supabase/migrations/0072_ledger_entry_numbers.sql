-- =====================================================================
-- KapitPondo — Migration 0072
-- Ledger entry numbers: every posting gets a per-group number the app shows
-- as LE-1001, LE-1002... so officers can point at an exact entry ("LE-1043
-- was reversed by LE-1040") instead of describing it.
--
-- ledger_entries is append-only (0001's ledger_no_update trigger). The
-- one-time backfill below is the only UPDATE this table ever takes: it
-- disables that trigger, numbers existing rows in posting order, and turns
-- it straight back on inside the same transaction. New rows are numbered by
-- a BEFORE INSERT trigger, so no posting RPC needs to change.
-- =====================================================================

alter table ledger_entries add column if not exists entry_no integer;

alter table ledger_entries disable trigger ledger_no_update;

with numbered as (
  select id, row_number() over (partition by group_id order by posted_at, id) as n
  from ledger_entries
  where entry_no is null
)
update ledger_entries l
set entry_no = numbered.n + coalesce((select max(entry_no) from ledger_entries x where x.group_id = l.group_id), 0)
from numbered
where l.id = numbered.id;

alter table ledger_entries enable trigger ledger_no_update;

alter table ledger_entries alter column entry_no set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ledger_entries_entry_no_unique') then
    alter table ledger_entries add constraint ledger_entries_entry_no_unique unique (group_id, entry_no);
  end if;
end $$;

-- Next number for the group. The advisory lock serializes concurrent
-- postings in the same group for the rest of the transaction, so two
-- inserts can't read the same max.
create or replace function assign_ledger_entry_no()
returns trigger language plpgsql as $$
begin
  if new.entry_no is null then
    perform pg_advisory_xact_lock(hashtext('ledger_entry_no:' || new.group_id::text));
    select coalesce(max(entry_no), 0) + 1 into new.entry_no
    from ledger_entries where group_id = new.group_id;
  end if;
  return new;
end; $$;

drop trigger if exists ledger_assign_entry_no on ledger_entries;
create trigger ledger_assign_entry_no before insert on ledger_entries
  for each row execute function assign_ledger_entry_no();

-- =====================================================================
-- End of 0072_ledger_entry_numbers.sql
-- =====================================================================
