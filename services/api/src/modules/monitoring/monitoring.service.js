const supabase = require('../../config/supabase');

async function platformOverview() {
  const { data, error } = await supabase.rpc('platform_overview');
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function groupsOverview() {
  const { data, error } = await supabase.rpc('groups_overview');
  if (error) throw error;
  return data;
}

// System-wide (sysadmin) audit feed — account verify/reject/id-view decisions.
// system_audit_log.actor_id references auth.users(id), not members(id), so it
// can't be embedded the way group-side audit_log's actor_id can; the admin
// console only ever displays a truncated raw id, so no join is needed.
async function auditFeed({ action, limit = 100 }) {
  let q = supabase
    .from('system_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (action) q = q.eq('action', action);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Recent platform-wide activity from the ledger (large movements first option)
async function recentLedger({ limit = 50 }) {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('*, groups:group_id(name, fund_code)')
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Infra-level DB health for the System Health > Database admin page. Doesn't
// throw on failure — an unreachable database is a status this should report,
// not a 500 that takes the page down.
async function databaseHealth() {
  const start = Date.now();
  try {
    const { data, error } = await supabase.rpc('database_health');
    if (error) throw error;
    return { reachable: true, latency_ms: Date.now() - start, ...enrichDatabaseHealth(data) };
  } catch (err) {
    return { reachable: false, latency_ms: Date.now() - start, error: err.message };
  }
}

// Configured storage cap for the disk-usage % shown on the Database Health
// page — Postgres has no built-in notion of provisioned volume size, so this
// is a manually-set constant (default matches Supabase's free-tier 500MB),
// not a queried value. Override with DB_STORAGE_CAPACITY_MB in production.
const STORAGE_CAPACITY_BYTES = Number(process.env.DB_STORAGE_CAPACITY_MB || 500) * 1024 * 1024;

// Rolling in-memory sample of xact_rollback (a real, cumulative Postgres
// counter) so the Database Health page can show a real "failed transactions"
// count over a recent window instead of a lifetime total. Resets on API
// restart; the window widens from 0 up to ROLLBACK_WINDOW_MS as samples
// accumulate, and the API reports how much of the window it actually has.
const ROLLBACK_WINDOW_MS = 60 * 60 * 1000; // 1h
let rollbackSamples = []; // { t: number, xact_rollback: number }[]

function sampleRollbacks(xactRollback) {
  const now = Date.now();
  rollbackSamples.push({ t: now, xact_rollback: xactRollback });
  rollbackSamples = rollbackSamples.filter((s) => now - s.t <= ROLLBACK_WINDOW_MS);
}

function rollbacksInWindow() {
  if (rollbackSamples.length < 2) return { count: null, window_ms: 0 };
  const latest = rollbackSamples[rollbackSamples.length - 1];
  const earliest = rollbackSamples[0];
  return { count: latest.xact_rollback - earliest.xact_rollback, window_ms: latest.t - earliest.t };
}

function enrichDatabaseHealth(data) {
  const connections = data.connections;
  const connection_pool_percent = connections && connections.max_connections
    ? Math.round((connections.total / connections.max_connections) * 1000) / 10
    : null;

  const disk_usage_percent = Math.round((data.database_size_bytes / STORAGE_CAPACITY_BYTES) * 1000) / 10;

  if (typeof data.xact_rollback === 'number') sampleRollbacks(data.xact_rollback);
  const { count, window_ms } = rollbacksInWindow();

  return {
    ...data,
    connection_pool_percent,
    disk_usage_percent,
    storage_capacity_bytes: STORAGE_CAPACITY_BYTES,
    failed_transactions_recent: count,
    failed_transactions_window_ms: window_ms,
  };
}

// Wraps a user-supplied term for interpolation into a PostgREST or()/ilike()
// filter string. Quoting the value stops embedded commas, parens, or dots in
// the search term from being parsed as extra filter syntax.
function toIlikeTerm(q) {
  return `"%${q.replace(/"/g, '\\"')}%"`;
}

// Cross-entity search for the admin dashboard's search bar — looks up
// members, groups, and audit log entries in parallel.
async function search(q, limit = 5) {
  const term = toIlikeTerm(q);

  const [membersRes, groupsRes, auditRes] = await Promise.all([
    supabase
      .from('members')
      .select('id, full_name, email, phone, verification_status')
      .or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
      .limit(limit),
    supabase
      .from('groups')
      .select('id, name, fund_code, status')
      .or(`name.ilike.${term},fund_code.ilike.${term}`)
      .limit(limit),
    supabase
      .from('system_audit_log')
      .select('id, action, target_type, target_id, created_at')
      .or(`action.ilike.${term},target_type.ilike.${term}`)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (groupsRes.error) throw groupsRes.error;
  if (auditRes.error) throw auditRes.error;

  return { members: membersRes.data, groups: groupsRes.data, audit: auditRes.data };
}

// ID verification queue health for the admin System Health > Auth Services
// page's "ID Verification Queue" column — pending count, oldest pending
// item age, and average review turnaround over the last 7 days.
async function verificationQueueHealth() {
  const { data, error } = await supabase.rpc('verification_queue_health');
  if (error) throw error;
  return data;
}

module.exports = { platformOverview, groupsOverview, auditFeed, recentLedger, search, databaseHealth, verificationQueueHealth };