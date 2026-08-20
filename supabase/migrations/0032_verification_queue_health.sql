-- ── verification_queue_health ────────────────────────────────────────
-- Real data for the admin "Auth Services Health" page's ID Verification
-- Queue column: pending count, oldest pending item age, and average review
-- turnaround over the last 7 days.
--
-- `submitted_at` is new: previously submitDocument() only touched
-- `updated_at`, which gets overwritten by every later mutation (including
-- the approve/reject decision itself), so the true submission time was lost
-- once a decision was made. Existing pending rows are backfilled with their
-- current `updated_at` as a best-effort estimate (their most recent
-- mutation, which — since they haven't been decided yet — is submission).
-- Turnaround for accounts already decided before this migration can't be
-- recovered; the average will only be accurate for decisions made after
-- services/api starts setting `submitted_at` on submission.

alter table members add column if not exists submitted_at timestamptz;

update members
set submitted_at = updated_at
where verification_status = 'pending' and submitted_at is null;

drop function if exists verification_queue_health();
create or replace function verification_queue_health()
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'pending_count', (
      select count(*) from members where verification_status = 'pending'
    ),
    'oldest_pending_hours', (
      select round(extract(epoch from (now() - min(coalesce(submitted_at, created_at)))) / 3600, 1)
      from members
      where verification_status = 'pending'
    ),
    'avg_turnaround_hours_7d', (
      select round(avg(extract(epoch from (decided_at - submitted_at)) / 3600)::numeric, 1)
      from (
        select
          coalesce(verified_at, case when verification_status = 'rejected' then updated_at end) as decided_at,
          submitted_at
        from members
        where verification_status in ('verified', 'rejected')
      ) d
      where decided_at is not null
        and submitted_at is not null
        and decided_at > now() - interval '7 days'
    ),
    'turnaround_sample_size_7d', (
      select count(*)
      from (
        select
          coalesce(verified_at, case when verification_status = 'rejected' then updated_at end) as decided_at,
          submitted_at
        from members
        where verification_status in ('verified', 'rejected')
      ) d
      where decided_at is not null
        and submitted_at is not null
        and decided_at > now() - interval '7 days'
    )
  ) into result;
  return result;
end;
$$;
