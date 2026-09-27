-- =====================================================================
-- KapitPondo — 0014 Functions: platform admin & health
-- Read-only overviews for the admin dashboard.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Overviews
-- ---------------------------------------------------------------------

create or replace function platform_overview()
returns table (
  total_members             bigint,
  verified_members          bigint,
  total_groups              bigint,
  active_cycles             bigint,
  total_contributions       numeric(14,2),
  total_loans_disbursed     numeric(14,2),
  total_outstanding_balance numeric(14,2)
)
language sql
security definer
stable
as $$
  select
    (select count(*) from members)                                                                      as total_members,
    (select count(*) from members where verification_status = 'verified')                               as verified_members,
    (select count(*) from groups  where status = 'active')                                              as total_groups,
    (select count(*) from cycles  where status = 'active')                                              as active_cycles,
    (select coalesce(sum(amount), 0) from ledger_entries where entry_type = 'contribution'    and direction = 'credit')::numeric(14,2),
    (select coalesce(sum(amount), 0) from ledger_entries where entry_type = 'loan_disbursement' and direction = 'debit')::numeric(14,2),
    (select coalesce(sum(outstanding_balance), 0) from loans where status in ('active', 'approved'))::numeric(14,2);
$$;

create or replace function groups_overview()
returns table (
  group_id       uuid,
  group_name     text,
  fund_code      text,
  active_members bigint,
  available_cash numeric(14,2),
  active_loans   bigint
)
language sql
security definer
stable
as $$
  select
    g.id,
    g.name,
    g.fund_code,
    (select count(*) from memberships m where m.group_id = g.id and m.status = 'active'),
    group_available_cash(g.id),
    (select count(*) from loans l where l.group_id = g.id and l.status in ('active', 'approved'))
  from groups g
  where g.status = 'active'
  order by g.created_at;
$$;

-- ---------------------------------------------------------------------
-- System health
-- ---------------------------------------------------------------------

-- Infra snapshot for the admin Database Health page, including transaction
-- counters (xact_commit / xact_rollback) the API turns into rates.
create or replace function database_health()
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'connections', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where state = 'active'),
        'idle', count(*) filter (where state = 'idle'),
        'max_connections', (select setting::int from pg_settings where name = 'max_connections')
      )
      from pg_stat_activity
      where datname = current_database()
    ),
    'cache_hit_ratio', (
      select case when (sum(blks_hit) + sum(blks_read)) = 0 then 1
             else round(sum(blks_hit)::numeric / (sum(blks_hit) + sum(blks_read)), 4)
             end
      from pg_stat_database
      where datname = current_database()
    ),
    'xact_commit', (
      select sum(xact_commit) from pg_stat_database where datname = current_database()
    ),
    'xact_rollback', (
      select sum(xact_rollback) from pg_stat_database where datname = current_database()
    ),
    'tables', (
      select jsonb_agg(t)
      from (
        select relname as name, n_live_tup as row_estimate,
               pg_total_relation_size(relid) as size_bytes,
               greatest(last_vacuum, last_autovacuum) as last_vacuum,
               greatest(last_analyze, last_autoanalyze) as last_analyze
        from pg_stat_user_tables
        order by pg_total_relation_size(relid) desc
        limit 8
      ) t
    )
  ) into result;
  return result;
end;
$$;

-- Review queue stats for the admin dashboard, from identity_submissions.
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
      select count(*) from identity_submissions where status = 'pending'
    ),
    'oldest_pending_hours', (
      select round(extract(epoch from (now() - min(submitted_at))) / 3600, 1)
      from identity_submissions
      where status = 'pending'
    ),
    'avg_turnaround_hours_7d', (
      select round(avg(extract(epoch from (reviewed_at - submitted_at)) / 3600)::numeric, 1)
      from identity_submissions
      where reviewed_at > now() - interval '7 days'
    ),
    'turnaround_sample_size_7d', (
      select count(*)
      from identity_submissions
      where reviewed_at > now() - interval '7 days'
    )
  ) into result;
  return result;
end;
$$;

create or replace function storage_health()
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_bytes', (
      select coalesce(sum((metadata->>'size')::bigint), 0)
      from storage.objects
      where bucket_id in ('id-documents', 'proofs', 'avatars')
    ),
    'bucket_bytes', (
      select coalesce(jsonb_object_agg(bucket_id, bytes), '{}'::jsonb)
      from (
        select bucket_id, coalesce(sum((metadata->>'size')::bigint), 0) as bytes
        from storage.objects
        where bucket_id in ('id-documents', 'proofs', 'avatars')
        group by bucket_id
      ) b
    ),
    'orphaned_proofs', (
      select count(*) from storage.objects o
      where o.bucket_id = 'proofs'
        and o.name not in (
          select proof_url from contributions where proof_url is not null
          union select proof_url from loan_payments where proof_url is not null
        )
    ),
    'orphaned_id_documents', (
      select count(*) from storage.objects o
      where o.bucket_id = 'id-documents'
        and o.name not in (
          select id_document_url from identity_submissions
          union select id_document_back_url from identity_submissions where id_document_back_url is not null
          union select selfie_url from identity_submissions where selfie_url is not null
        )
    ),
    'orphaned_avatars', (
      select count(*) from storage.objects o
      where o.bucket_id = 'avatars'
        and o.name not in (
          select avatar_url from members where avatar_url is not null
        )
    ),
    'category_volume', jsonb_build_object(
      'idVerification', (select count(*) from identity_submissions),
      'contributionProof', (select count(*) from contributions where proof_url is not null),
      'loanReference', (select count(*) from loan_payments where proof_url is not null)
    ),
    'sample_object', (
      select jsonb_build_object('bucket_id', bucket_id, 'name', name)
      from storage.objects
      where bucket_id in ('id-documents', 'proofs', 'avatars')
      order by created_at desc
      limit 1
    )
  ) into result;
  return result;
end;
$$;
