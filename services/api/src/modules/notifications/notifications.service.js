const supabase = require('../../config/supabase');

async function listMyNotifications({ memberId, limit = 50, unreadOnly = false }) {
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function markRead({ id, memberId }) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('member_id', memberId) // scoped so a member can only mark their own notifications read
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function markAllRead(memberId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('member_id', memberId)
    .eq('is_read', false);
  if (error) throw error;
}

// One row per device (token is globally unique). Re-registering the same
// token — new login, app relaunch — just repoints it at the current member.
async function registerPushToken({ memberId, token, platform }) {
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { member_id: memberId, token, platform: platform ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
  if (error) throw error;
}

async function unregisterPushToken(token) {
  const { error } = await supabase.from('push_tokens').delete().eq('token', token);
  if (error) throw error;
}

module.exports = { listMyNotifications, markRead, markAllRead, registerPushToken, unregisterPushToken };
