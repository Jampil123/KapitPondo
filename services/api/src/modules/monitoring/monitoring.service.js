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

// Fund Group Monitoring — read-only overview of every group (migration 0055).
// Deliberately no write counterpart: approving contributions/loans stays
// with each group's officers.
//
// Prefers the SQL function (one round trip, aggregates in Postgres). If that
// migration hasn't been applied yet, PostgREST answers PGRST202 ("function not
// found in the schema cache") — fall back to computing the same figures from
// the tables so the admin page still works. Same field names either way.
async function fundGroupsMonitoring() {
  const { data, error } = await supabase.rpc('fund_groups_monitoring');
  if (!error) return data;
  if (error.code !== 'PGRST202') throw error;
  return fundGroupsMonitoringFromTables();
}

// Returns the latest of a set of timestamps, ignoring nulls — the JS twin of
// the SQL greatest(...) used for last_activity_at.
function latest(...values) {
  const times = values.filter(Boolean).map((v) => new Date(v).getTime()).filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

async function fundGroupsMonitoringFromTables() {
  const [groups, memberships, cycles, loans, ledger, contributions, audit] = await Promise.all([
    supabase.from('groups').select('id, name, fund_code, status, owner_id, created_at, updated_at, owner:owner_id(full_name)'),
    supabase.from('memberships').select('group_id, status, updated_at'),
    supabase.from('cycles').select('id, group_id, name, contribution_amount, frequency').eq('status', 'active'),
    supabase.from('loans').select('group_id, status, outstanding_balance, updated_at'),
    supabase.from('ledger_entries').select('group_id, entry_type, direction, amount, posted_at'),
    supabase.from('contributions').select('group_id, updated_at'),
    supabase.from('audit_log').select('group_id, created_at'),
  ]);
  for (const r of [groups, memberships, cycles, loans, ledger, contributions, audit]) {
    if (r.error) throw r.error;
  }

  // Per-group accumulators, keyed by group id.
  const acc = new Map(groups.data.map((g) => [g.id, {
    member_count: 0,
    total_contributions: 0,
    fund_balance: 0,
    outstanding_loans: 0,
    outstanding_loan_count: 0,
    last: null,
  }]));

  for (const m of memberships.data) {
    const a = acc.get(m.group_id);
    if (!a) continue;
    if (m.status === 'active') a.member_count += 1;
    a.last = latest(a.last, m.updated_at);
  }

  for (const l of ledger.data) {
    const a = acc.get(l.group_id);
    if (!a) continue;
    const amount = Number(l.amount) || 0;
    // Same definitions as group_summary() / group_available_cash().
    if (l.entry_type === 'contribution' && l.direction === 'credit') a.total_contributions += amount;
    a.fund_balance += l.direction === 'credit' ? amount : -amount;
    a.last = latest(a.last, l.posted_at);
  }

  for (const ln of loans.data) {
    const a = acc.get(ln.group_id);
    if (!a) continue;
    if (ln.status === 'active' || ln.status === 'defaulted') {
      a.outstanding_loans += Number(ln.outstanding_balance) || 0;
      a.outstanding_loan_count += 1;
    }
    a.last = latest(a.last, ln.updated_at);
  }

  for (const c of contributions.data) {
    const a = acc.get(c.group_id);
    if (a) a.last = latest(a.last, c.updated_at);
  }
  for (const e of audit.data) {
    const a = acc.get(e.group_id);
    if (a) a.last = latest(a.last, e.created_at);
  }

  const cycleByGroup = new Map(cycles.data.map((c) => [c.group_id, c])); // at most one active per group

  return groups.data
    .map((g) => {
      const a = acc.get(g.id);
      const cycle = cycleByGroup.get(g.id) ?? null;
      return {
        group_id: g.id,
        group_name: g.name,
        fund_code: g.fund_code,
        organizer_id: g.owner_id,
        organizer_name: g.owner?.full_name ?? null,
        member_count: a.member_count,
        active_cycle_id: cycle?.id ?? null,
        active_cycle_name: cycle?.name ?? null,
        active_cycle_amount: cycle?.contribution_amount ?? null,
        active_cycle_frequency: cycle?.frequency ?? null,
        total_contributions: a.total_contributions,
        outstanding_loans: a.outstanding_loans,
        outstanding_loan_count: a.outstanding_loan_count,
        fund_balance: a.fund_balance,
        group_status: g.status,
        created_at: g.created_at,
        last_activity_at: latest(a.last, g.updated_at),
      };
    })
    .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
}

// Fund Group Statistics for the admin dashboard — group counts by status.
// Plain COUNT queries (no RPC) so this works without a migration, and unlike
// platform_overview().total_groups it counts archived groups too.
async function fundGroupStats() {
  const countBy = async (status) => {
    let q = supabase.from('groups').select('id', { count: 'exact', head: true });
    if (status) q = q.eq('status', status);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };

  const [total, active, archived] = await Promise.all([
    countBy(null), countBy('active'), countBy('archived'),
  ]);
  return { total, active, archived };
}

// System-wide (sysadmin) audit feed — account verify/reject/id-view decisions.
// system_audit_log.actor_id references auth.users(id), not members(id), so it
// can't be embedded the way group-side audit_log's actor_id can — the names
// below are resolved with a lookup instead (actor via members.auth_id, target
// via members.id or groups.id) so the audit trail can name who did what to
// whom rather than printing raw uuids.
async function auditFeed({ action, limit = 100 }) {
  let q = supabase
    .from('system_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (action) q = q.eq('action', action);
  const { data, error } = await q;
  if (error) throw error;

  const [membersRes, groupsRes] = await Promise.all([
    supabase.from('members').select('id, full_name, email, auth_id'),
    supabase.from('groups').select('id, name'),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (groupsRes.error) throw groupsRes.error;

  const byId = new Map();
  const byAuthId = new Map();
  for (const m of membersRes.data) {
    const name = m.full_name || m.email || null;
    byId.set(m.id, name);
    if (m.auth_id) byAuthId.set(m.auth_id, name);
  }
  const groups = new Map(groupsRes.data.map((g) => [g.id, g.name]));

  return data.map((e) => ({
    ...e,
    actor_name: e.actor_id ? byAuthId.get(e.actor_id) ?? null : null,
    target_name: e.target_id ? byId.get(e.target_id) ?? groups.get(e.target_id) ?? null : null,
  }));
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

module.exports = { platformOverview, groupsOverview, fundGroupsMonitoring, fundGroupStats, auditFeed, recentLedger, search };