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

module.exports = { platformOverview, groupsOverview, auditFeed, recentLedger };