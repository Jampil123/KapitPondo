-- =====================================================================
-- KapitPondo — Migration 0071
-- Audit findings get a per-group number (AF-01, AF-02...) like flags do
-- (0070), and can cover one or more flags: a finding is the Auditor's
-- formal report to the Organizer, often written up from flags already
-- raised on individual records.
-- =====================================================================

alter table audit_findings add column if not exists seq integer;
alter table audit_findings add column if not exists flag_ids uuid[] not null default '{}';

-- Number existing findings in the order they were raised.
with numbered as (
  select id, row_number() over (partition by group_id order by created_at) as n
  from audit_findings
  where seq is null
)
update audit_findings f
set seq = numbered.n + coalesce((select max(seq) from audit_findings x where x.group_id = f.group_id), 0)
from numbered
where f.id = numbered.id;

alter table audit_findings alter column seq set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'audit_findings_seq_unique') then
    alter table audit_findings add constraint audit_findings_seq_unique unique (group_id, seq);
  end if;
end $$;

-- =====================================================================
-- End of 0071_finding_numbers_and_flags.sql
-- =====================================================================
