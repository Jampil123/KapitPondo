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

module.exports = { platformOverview, groupsOverview, auditFeed, recentLedger, search };