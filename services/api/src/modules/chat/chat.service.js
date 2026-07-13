const supabase = require('../../config/supabase');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Newest-first page, optionally before a cursor (created_at of the oldest
// already-loaded message) — the client reverses this for inverted-FlatList display.
async function listMessages({ groupId, channel, limit, before }) {
  const pageSize = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
  let query = supabase
    .from('messages')
    .select('id, group_id, channel, sender_id, sender_name, body, created_at')
    .eq('group_id', groupId)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(pageSize);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function sendMessage({ groupId, channel, senderId, senderName, body }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ group_id: groupId, channel, sender_id: senderId, sender_name: senderName, body })
    .select('id, group_id, channel, sender_id, sender_name, body, created_at')
    .single();
  if (error) throw error;
  return data;
}

module.exports = { listMessages, sendMessage };
