/**
 * services/api/src/modules/directMessages/directMessages.service.js
 * 1:1 messages between two active members of the same group (see
 * 0050_direct_messages.sql). "officers" and "general" (chat.service.js) are
 * shared rooms; a DM's channel is just the (sender, recipient) pair.
 */
const supabase = require('../../config/supabase');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

async function isActiveMember(groupId, memberId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id')
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// Newest-first page of the conversation between memberId and otherId,
// optionally before a cursor — mirrors chat.service.js's listMessages.
async function listConversation({ groupId, memberId, otherId, limit, before }) {
  const pageSize = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
  let query = supabase
    .from('direct_messages')
    .select('id, group_id, sender_id, recipient_id, sender_name, body, image_url, created_at')
    .eq('group_id', groupId)
    .or(`and(sender_id.eq.${memberId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${memberId})`)
    .order('created_at', { ascending: false })
    .limit(pageSize);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function sendDirectMessage({ groupId, senderId, senderName, recipientId, body, imageUrl }) {
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      group_id: groupId, sender_id: senderId, recipient_id: recipientId,
      sender_name: senderName, body, image_url: imageUrl ?? null,
    })
    .select('id, group_id, sender_id, recipient_id, sender_name, body, image_url, created_at')
    .single();
  if (error) throw error;
  return data;
}

module.exports = { isActiveMember, listConversation, sendDirectMessage };
