/**
 * services/api/src/modules/chatReads/chatReads.service.js
 * When each member last opened each conversation (see 0064_chat_reads.sql).
 */
const supabase = require('../../config/supabase');

// The caller's own marks, plus — for each DM — when the other person last
// read their side of it (their 'dm:<caller>' mark), keyed by their member id.
async function listForMember(groupId, memberId) {
  const [mine, theirs] = await Promise.all([
    supabase.from('chat_reads').select('conversation, last_read_at')
      .eq('group_id', groupId).eq('member_id', memberId),
    supabase.from('chat_reads').select('member_id, last_read_at')
      .eq('group_id', groupId).eq('conversation', `dm:${memberId}`),
  ]);
  if (mine.error) throw mine.error;
  if (theirs.error) throw theirs.error;
  return {
    mine: Object.fromEntries(mine.data.map((r) => [r.conversation, r.last_read_at])),
    theirs: Object.fromEntries(theirs.data.map((r) => [r.member_id, r.last_read_at])),
  };
}

async function markRead(groupId, memberId, conversation) {
  const { data, error } = await supabase
    .from('chat_reads')
    .upsert({ group_id: groupId, member_id: memberId, conversation, last_read_at: new Date().toISOString() })
    .select('conversation, last_read_at')
    .single();
  if (error) throw error;
  return data;
}

// Everyone else's mark on a shared room, with names for "Seen by ...".
async function roomReaders(groupId, conversation, exceptMemberId) {
  const { data, error } = await supabase
    .from('chat_reads')
    .select('member_id, last_read_at, member:members!member_id(full_name, avatar_url)')
    .eq('group_id', groupId)
    .eq('conversation', conversation)
    .neq('member_id', exceptMemberId);
  if (error) throw error;
  return data.map((r) => ({
    member_id: r.member_id,
    full_name: r.member?.full_name ?? null,
    avatar_url: r.member?.avatar_url ?? null,
    last_read_at: r.last_read_at,
  }));
}

module.exports = { listForMember, markRead, roomReaders };
