/**
 * services/api/src/modules/monitoring/dashboard.service.js
 * The admin console's main dashboard (GET /admin/monitoring/dashboard):
 * platform-level monitoring only — user and fund-group counts plus recent
 * system activity. Deliberately carries no financial amounts; those stay on
 * the fund group pages and in Reports.
 *
 * Fund group buckets (groups.status only knows active / archived):
 *   archived — the Organizer archived the group
 *   closed   — not archived, no active cycle, and at least one cycle has
 *              closed: the group finished its fund cycle and hasn't started
 *              another
 *   active   — every other non-archived group (running a cycle, or still
 *              setting its first one up)
 * Suspended groups (migration 0065) are counted on their own as well.
 */
const supabase = require('../../config/supabase');

const RECENT_DAYS = 7;
const FEED_LIMIT = 30; // the console filters this client-side

function isMissingColumn(error) {
  return error?.code === '42703' || /suspended_at/.test(error?.message ?? '');
}

async function count(query) {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

// count() for a query on a column that only exists after a migration.
async function countOptional(query) {
  try { return await count(query); } catch (e) { if (isMissingColumn(e)) return 0; throw e; }
}

function head(table) {
  return supabase.from(table).select('id', { count: 'exact', head: true });
}

async function userStats() {
  const [total, pending, verified, rejected, resubmission, suspended] = await Promise.all([
    count(head('members')),
    count(head('members').eq('verification_status', 'pending')),
    count(head('members').eq('verification_status', 'verified')),
    count(head('members').eq('verification_status', 'rejected')),
    count(head('members').eq('verification_status', 'resubmission_required')),
    countOptional(head('members').not('suspended_at', 'is', null)),
  ]);
  return { total, pending, verified, rejected, resubmission_required: resubmission, suspended };
}

async function groupStats() {
  const [{ data: groups, error }, { data: cycles, error: cErr }] = await Promise.all([
    supabase.from('groups').select('id, status'),
    supabase.from('cycles').select('group_id, status'),
  ]);
  if (error) throw error;
  if (cErr) throw cErr;

  const activeCycle = new Set(cycles.filter((c) => c.status === 'active').map((c) => c.group_id));
  const closedCycle = new Set(cycles.filter((c) => c.status === 'closed').map((c) => c.group_id));

  let active = 0; let closed = 0; let archived = 0;
  for (const g of groups) {
    if (g.status === 'archived') archived += 1;
    else if (!activeCycle.has(g.id) && closedCycle.has(g.id)) closed += 1;
    else active += 1;
  }
  const suspended = await countOptional(head('groups').not('suspended_at', 'is', null));
  return { total: groups.length, active, closed, archived, suspended };
}

// Local calendar day (Asia/Manila — the platform's users) for a timestamp.
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (iso) => DAY_FMT.format(new Date(iso));

// The last RECENT_DAYS days, oldest first, each with its registrations and
// new fund groups.
function dailySeries(memberDates, groupDates) {
  const days = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(Date.now() - i * 86400000).toISOString());
    days.push({ date: key, registrations: 0, groups: 0 });
  }
  const byKey = new Map(days.map((d) => [d.date, d]));
  for (const t of memberDates) { const d = byKey.get(dayKey(t)); if (d) d.registrations += 1; }
  for (const t of groupDates) { const d = byKey.get(dayKey(t)); if (d) d.groups += 1; }
  return days;
}

// Audit action → feed kind (the console's filter chips).
function kindOf(action) {
  if (['account.verified', 'account.rejected', 'account.resubmission_requested'].includes(action)) return 'verification';
  if (['account.suspended', 'account.reinstated', 'group.suspended', 'group.reinstated'].includes(action)) return 'suspension';
  return 'system';
}

async function recentActivity() {
  // A day of slack so the oldest bar is a full local day.
  const since = new Date(Date.now() - (RECENT_DAYS + 1) * 86400000).toISOString();

  const [recentMembers, recentGroups, audit, members, groupNames] = await Promise.all([
    supabase.from('members').select('id, full_name, email, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }),
    supabase.from('groups').select('id, name, fund_code, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }),
    // ID views are routine and would drown out everything else.
    supabase.from('system_audit_log').select('id, action, actor_id, target_type, target_id, metadata, created_at')
      .neq('action', 'account.id_viewed')
      .order('created_at', { ascending: false }).limit(FEED_LIMIT),
    supabase.from('members').select('id, full_name, email, auth_id'),
    supabase.from('groups').select('id, name'),
  ]);
  for (const r of [recentMembers, recentGroups, audit, members, groupNames]) {
    if (r.error) throw r.error;
  }

  const byId = new Map(); const byAuth = new Map();
  for (const m of members.data) {
    const name = m.full_name || m.email || null;
    byId.set(m.id, name);
    if (m.auth_id) byAuth.set(m.auth_id, name);
  }
  const groupById = new Map(groupNames.data.map((g) => [g.id, g.name]));

  const daily = dailySeries(recentMembers.data.map((m) => m.created_at), recentGroups.data.map((g) => g.created_at));

  // One feed: admin actions + new registrations + new fund groups, newest first.
  const feed = [
    ...audit.data.map((e) => ({
      id: e.id,
      kind: kindOf(e.action),
      action: e.action,
      target_type: e.target_type ?? 'account',
      target_name: e.target_id ? byId.get(e.target_id) ?? groupById.get(e.target_id) ?? null : null,
      actor_name: e.actor_id ? byAuth.get(e.actor_id) ?? null : null,
      reason: e.metadata?.reason ?? null,
      created_at: e.created_at,
    })),
    ...recentMembers.data.map((m) => ({
      id: `member-${m.id}`, kind: 'registration', action: 'member.registered', target_type: 'account',
      target_name: m.full_name || m.email || null, actor_name: null, reason: null, created_at: m.created_at,
    })),
    ...recentGroups.data.map((g) => ({
      id: `group-${g.id}`, kind: 'group', action: 'group.created', target_type: 'group',
      target_name: g.name, actor_name: null, reason: null, created_at: g.created_at,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, FEED_LIMIT);

  return {
    window_days: RECENT_DAYS,
    daily,
    new_registrations: { count: daily.reduce((n, d) => n + d.registrations, 0) },
    new_groups: { count: daily.reduce((n, d) => n + d.groups, 0) },
    feed,
  };
}

async function dashboard() {
  const [users, groups, activity] = await Promise.all([userStats(), groupStats(), recentActivity()]);
  return { users, groups, activity, generated_at: new Date().toISOString() };
}

module.exports = { dashboard };
