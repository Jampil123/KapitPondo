-- ── database_health ──────────────────────────────────────────────────
-- Infra-level health snapshot for the admin System Health > Database page:
-- database size, connection counts, cache hit ratio, and the largest
-- tables. security definer so it can read pg_stat_activity / pg_stat_database
-- (which are restricted to the connection's own backend for non-superusers)
-- regardless of who calls it.
drop function if exists database_health();
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
