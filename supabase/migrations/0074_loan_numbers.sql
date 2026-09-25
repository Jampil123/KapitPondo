-- =====================================================================
-- KapitPondo — Migration 0074
-- Loan numbers: every loan gets a per-group number the app shows as
-- LN-0151, so the Auditor can point at a loan decision exactly. Same shape
-- as ledger entry numbers (0072), minus the append-only dance — loans are
-- an ordinary table.
-- =====================================================================

alter table loans add column if not exists loan_no integer;

with numbered as (
  select id, row_number() over (partition by group_id order by applied_at, id) as n
  from loans
  where loan_no is null
)
update loans l
set loan_no = numbered.n + coalesce((select max(loan_no) from loans x where x.group_id = l.group_id), 0)
from numbered
where l.id = numbered.id;

alter table loans alter column loan_no set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loans_loan_no_unique') then
    alter table loans add constraint loans_loan_no_unique unique (group_id, loan_no);
  end if;
end $$;

create or replace function assign_loan_no()
returns trigger language plpgsql as $$
begin
  if new.loan_no is null then
    perform pg_advisory_xact_lock(hashtext('loan_no:' || new.group_id::text));
    select coalesce(max(loan_no), 0) + 1 into new.loan_no
    from loans where group_id = new.group_id;
  end if;
  return new;
end; $$;

drop trigger if exists loans_assign_loan_no on loans;
create trigger loans_assign_loan_no before insert on loans
  for each row execute function assign_loan_no();

-- =====================================================================
-- End of 0074_loan_numbers.sql
-- =====================================================================
