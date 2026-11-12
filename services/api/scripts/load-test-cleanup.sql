-- services/api/scripts/load-test-cleanup.sql
-- Removes ALL data created by scripts/load-test-50.js:
--   * groups with description = 'load-test-50' (fund code LT...)
--   * the loadtest.uNN@kapitpondo.test users (auth + members) and everything
--     that references them (memberships, contributions, ledger, audit log, ...)
--
-- Run in the Supabase SQL Editor. Everything is ONE transaction: if any
-- statement fails, nothing is deleted and the append-only triggers stay on.
-- DRY RUN: change the final COMMIT to ROLLBACK, run it, read the NOTICE counts.
--
-- The ledger_entries / audit_log append-only triggers (and other user
-- triggers) are disabled only inside this transaction and re-enabled before
-- COMMIT. Foreign-key checks stay ON the whole time, so nothing is orphaned:
-- if a real row still pointed at a test row, the delete would fail and roll back.

begin;

-- 1. The exact rows to remove ------------------------------------------------
create temp table lt_groups on commit drop as
  select id, fund_code from public.groups
  where description = 'load-test-50' and fund_code like 'LT%';

create temp table lt_users on commit drop as
  select id from auth.users
  where email ~ '^loadtest\.u[0-9]{2}@kapitpondo\.test$';

do $$
declare g int; u int;
begin
  select count(*) into g from lt_groups;
  select count(*) into u from lt_users;
  raise notice 'Load-test groups: %, load-test users: %', g, u;
  if g > 5 or u > 50 then
    raise exception 'Unexpected row counts (groups %, users %) — aborting', g, u;
  end if;
end $$;

-- 2. Recursive delete: child rows first, following real FK metadata ----------
create function pg_temp.lt_purge(tbl regclass, pred text, depth int default 0)
returns void language plpgsql as $$
declare
  fk record;
  child_pred text;
  hit boolean;
  n bigint;
begin
  if depth > 30 then
    raise exception 'lt_purge: reference chain too deep at %', tbl;
  end if;
  for fk in
    select c.conrelid::regclass as child, ca.attname as child_col, pa.attname as parent_col
    from pg_constraint c
    join pg_attribute ca on ca.attrelid = c.conrelid  and ca.attnum = c.conkey[1]
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
    where c.contype = 'f'
      and c.confrelid = tbl
      and array_length(c.conkey, 1) = 1
      and c.confdeltype not in ('n', 'd')       -- SET NULL / SET DEFAULT: Postgres handles it
  loop
    child_pred := format('%I in (select %I from %s where %s)', fk.child_col, fk.parent_col, tbl, pred);
    execute format('select exists (select 1 from %s where %s)', fk.child, child_pred) into hit;
    if hit then
      perform pg_temp.lt_purge(fk.child, child_pred, depth + 1);
    end if;
  end loop;
  execute format('delete from %s where %s', tbl, pred);
  get diagnostics n = row_count;
  if n > 0 then raise notice '%  deleted % row(s) from %', repeat('  ', depth), n, tbl; end if;
end $$;

-- 3. Turn off user triggers (append-only guards etc.) for this transaction ---
--    Only triggers that are currently ON are recorded and turned off, so step 5
--    restores exactly the state you had before.
create temp table lt_triggers on commit drop as
  select tg.tgrelid::regclass as tbl, tg.tgname as name
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and not tg.tgisinternal and tg.tgenabled <> 'D';

do $$
declare t record;
begin
  for t in select * from lt_triggers loop
    execute format('alter table %s disable trigger %I', t.tbl, t.name);
  end loop;
end $$;

-- 4. Delete ----------------------------------------------------------------------
select pg_temp.lt_purge('public.groups', 'id in (select id from lt_groups)');
-- members.auth_id → auth.users cascades, so this also clears members and
-- everything that points at them.
select pg_temp.lt_purge('auth.users', 'id in (select id from lt_users)');

-- 5. Turn the same triggers back on ---------------------------------------------
do $$
declare t record;
begin
  for t in select * from lt_triggers loop
    execute format('alter table %s enable trigger %I', t.tbl, t.name);
  end loop;
end $$;

-- 6. Check nothing is left, and the guards are back on -------------------------
do $$
declare left_g int; left_m int; off int;
begin
  select count(*) into left_g from public.groups where description = 'load-test-50';
  select count(*) into left_m from public.members where email ~ '^loadtest\.u[0-9]{2}@kapitpondo\.test$';
  select count(*) into off from lt_triggers t
    join pg_trigger tg on tg.tgrelid = t.tbl and tg.tgname = t.name
    where tg.tgenabled = 'D';
  raise notice 'Remaining: groups %, members %. Triggers still off: %', left_g, left_m, off;
  if left_g > 0 or left_m > 0 or off > 0 then raise exception 'Test data still present — rolling back'; end if;
end $$;

commit;   -- change to ROLLBACK for a dry run
