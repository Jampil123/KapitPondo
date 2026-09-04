/**
 * services/api/src/modules/announcements/announcements.service.js
 * Owner broadcasts (announcements) + Treasurer/Owner targeted payment
 * reminders. Both fan out through notify() (lib/notifications.js) — an
 * announcement also leaves a row in `announcements` that any active member
 * can read back later; a reminder does not (it's private, one `notifications`
 * row per recipient, never a group-readable record of who owes money).
 */
const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

const TYPE_LABEL = { reminder: 'Payment reminder', meeting: 'Meeting', cycle: 'Cycle update', urgent: 'Urgent' };

function monthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// Active members of the group's active cycle with no submitted/approved
// contribution yet this calendar month — the same "current period = this
// month" simplification penalties.service.js's checkLatePenalties uses (see
// its comment for why), so this list is a superset of who that job would
// eventually charge a penalty for once their due day passes. Returns []
// when the group has no active cycle.
async function resolveUnpaidMembers(groupId) {
  const { data: cycle, error: cycleErr } = await supabase
    .from('cycles')
    .select('id')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .maybeSingle();
  if (cycleErr) throw cycleErr;
  if (!cycle) return [];

  const { data: memberships, error: mErr } = await supabase
    .from('memberships')
    .select('id, member_id, members!memberships_member_id_fkey(full_name)')
    .eq('group_id', groupId)
    .eq('status', 'active');
  if (mErr) throw mErr;
  if (!memberships?.length) return [];

  const { start, end } = monthRange();
  const { data: paidRows, error: pErr } = await supabase
    .from('contributions')
    .select('membership_id')
    .eq('cycle_id', cycle.id)
    .in('status', ['submitted', 'approved'])
    .gte('created_at', start)
    .lt('created_at', end);
  if (pErr) throw pErr;

  const paidMembershipIds = new Set((paidRows ?? []).map((r) => r.membership_id));

  return memberships
    .filter((m) => !paidMembershipIds.has(m.id))
    .map((m) => ({ member_id: m.member_id, full_name: m.members?.full_name ?? null }));
}

async function resolveAudienceMemberIds(groupId, audience, excludeMemberId) {
  if (audience === 'unpaid') {
    const unpaid = await resolveUnpaidMembers(groupId);
    return unpaid.map((m) => m.member_id).filter((id) => id !== excludeMemberId);
  }
  let q = supabase.from('memberships').select('member_id, role').eq('group_id', groupId).eq('status', 'active');
  if (audience === 'officers') q = q.in('role', ['owner', 'treasurer', 'auditor']);
  const { data, error } = await q;
  if (error) throw error;
  return data.map((m) => m.member_id).filter((id) => id !== excludeMemberId);
}

async function listAnnouncements({ groupId, limit, before }) {
  const pageSize = Math.min(Number(limit) || 20, 50);
  let q = supabase
    .from('announcements')
    .select('id, group_id, sender_name, sender_role, type, body, audience, recipient_count, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(pageSize);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function createAnnouncement({ groupId, senderId, senderName, senderRole, type, body, audience, sendPush = true }) {
  const recipientIds = await resolveAudienceMemberIds(groupId, audience, senderId);

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      group_id: groupId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      type,
      body,
      audience,
      recipient_count: recipientIds.length,
    })
    .select()
    .single();
  if (error) throw error;

  if (sendPush) {
    await Promise.all(recipientIds.map((memberId) => notify({
      memberId,
      groupId,
      type: `announcement.${type}`,
      title: TYPE_LABEL[type] ?? 'Announcement',
      message: body,
    })));
  }

  return announcement;
}

// Private — no announcements row, no group-readable trace of who owes money.
async function sendReminder({ groupId, body }) {
  const unpaid = await resolveUnpaidMembers(groupId);
  await Promise.all(unpaid.map((m) => notify({
    memberId: m.member_id,
    groupId,
    type: 'payment.reminder',
    title: 'Payment reminder',
    message: body,
  })));
  return { sent_count: unpaid.length, members: unpaid };
}

module.exports = { resolveUnpaidMembers, listAnnouncements, createAnnouncement, sendReminder };
