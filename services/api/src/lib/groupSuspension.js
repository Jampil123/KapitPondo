/**
 * services/api/src/lib/groupSuspension.js
 * Whether a fund group is suspended by the System Administrator
 * (migration 0065). Until that migration is applied the columns don't exist;
 * that reads as "not suspended" so group activity keeps working.
 */
const supabase = require('../config/supabase');

function isMissingColumn(error) {
  return error?.code === '42703' || /suspended_at|suspension_reason/.test(error?.message ?? '');
}

// → { suspended_at, suspension_reason } when suspended, else null.
async function groupSuspension(groupId) {
  const { data, error } = await supabase
    .from('groups')
    .select('suspended_at, suspension_reason')
    .eq('id', groupId)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return null;
    throw error;
  }
  return data?.suspended_at ? data : null;
}

function suspendedGroupMessage(s) {
  return s.suspension_reason
    ? `This fund group is suspended: ${s.suspension_reason}. You can view records, but not make changes.`
    : 'This fund group is suspended. You can view records, but not make changes.';
}

// Active platform admin? (platform_admins is the single source of truth.)
async function isPlatformAdminUser(authUserId) {
  if (!authUserId) return false;
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authUserId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

module.exports = { groupSuspension, suspendedGroupMessage, isPlatformAdminUser, isMissingColumn };
