-- ── database_health (extend) ─────────────────────────────────────────
-- Adds real transaction counters (xact_commit / xact_rollback) to the
-- infra health snapshot used by the admin System Health > Database Health
-- page, so failed/rolled-back transactions can be tracked as real data
-- (via a delta over time in the API layer) instead of simulated.
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
