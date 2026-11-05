// services/api/src/modules/groups/handover.service.js
// KapitPondo — Organizer hand-over (UC-GM-10, migration 0072).
//
//   Organizer (or Sysadmin, A1) sends ─▶ pending ─▶ member accepts  ─▶ accepted (role moves)
//                                                ├▶ member declines ─▶ declined
//                                                ├▶ Organizer cancels ─▶ cancelled
//                                                └▶ 7 days pass       ─▶ expired
//
// The Organizer keeps the role until the member accepts. Pending approvals
// aren't stored against a person — every queue is by role — so they move to
// the new Organizer with the role itself.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

const fail = (status, message) => Object.assign(new Error(message), { status });

const SELECT = '*, from:members!from_member_id(full_name), to:members!to_member_id(full_name, avatar_url)';

// Mark overdue requests expired and tell whoever sent them. Run before every
// read or action, since nothing else would ever flip them.
async function expireOverdue(groupId) {
  const { data, error } = await supabase
    .from('organizer_handovers')
    .update({ status: 'expired' })
    .eq('group_id', groupId).eq('status', 'pending').lt('expires_at', new Date().toISOString())
    .select('id, from_member_id, to:members!to_member_id(full_name)');
  if (error) throw error;
  await Promise.all((data ?? []).filter((h) => h.from_member_id).map((h) => notify({
    memberId: h.from_member_id, groupId, type: 'handover.expired',
    title: 'Hand-over request expired',
    message: `${h.to?.full_name ?? 'The member'} didn't answer in time. You're still the Organizer and can choose someone else.`,
  })));
}

async function pendingFor(groupId) {
  await expireOverdue(groupId);
  const { data, error } = await supabase
    .from('organizer_handovers').select(SELECT)
    .eq('group_id', groupId).eq('status', 'pending').maybeSingle();
  if (error) throw error;
  return data;
}

/** The pending request the caller is part of (as the Organizer or the chosen member), else null. */
async function currentRequest(groupId, memberId, role) {
  const h = await pendingFor(groupId);
  if (!h) return null;
  return role === 'owner' || h.to_member_id === memberId ? h : null;
}

/** Step 1: who can be chosen, who can't and why, and what moves to the new Organizer. */
async function options(groupId) {
  const [roster, pendingMembers, pendingLoans, reversals, distributions] = await Promise.all([
    supabase.from('memberships')
      .select('member_id, role, status, heads, joined_at, members!member_id(full_name, avatar_url, verification_status)')
      .eq('group_id', groupId).eq('status', 'active'),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
    supabase.from('loans').select('id, membership:memberships!membership_id(role)').eq('group_id', groupId).eq('status', 'pending'),
    supabase.from('ledger_reversal_requests').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'verified'),
    supabase.from('distributions').select('id', { count: 'exact', head: true }).eq('group_id', groupId).in('status', ['previewed', 'verified']),
  ]);
  for (const r of [roster, pendingMembers, pendingLoans, reversals, distributions]) if (r.error) throw r.error;

  const people = (roster.data ?? []).filter((m) => m.role !== 'owner').map((m) => {
    const verified = m.members?.verification_status === 'verified';
    const officer = m.role === 'treasurer' || m.role === 'auditor';
    return {
      member_id: m.member_id,
      full_name: m.members?.full_name ?? null,
      avatar_url: m.members?.avatar_url ?? null,
      role: m.role,
      heads: m.heads,
      joined_at: m.joined_at,
      eligible: verified && !officer,
      // E3: an officer must have their role revoked first; unverified accounts can't hold the role.
      blocked: officer ? `Currently ${m.role === 'treasurer' ? 'the Treasurer' : 'the Auditor'} — revoke that role first` : verified ? null : 'Account not verified',
    };
  });

  return {
    members: people,
    tasks: {
      membership_requests: pendingMembers.count ?? 0,
      // The Organizer decides every loan but their own.
      loan_requests: (pendingLoans.data ?? []).filter((l) => l.membership?.role !== 'owner').length,
      reversals: reversals.count ?? 0,
      distribution: (distributions.count ?? 0) > 0,
    },
  };
}

async function checkTarget(groupId, toMemberId) {
  const { data: target, error } = await supabase
    .from('memberships')
    .select('role, status, members!member_id(full_name, verification_status)')
    .eq('group_id', groupId).eq('member_id', toMemberId).maybeSingle();
  if (error) throw error;
  if (!target || target.status !== 'active') throw fail(409, 'Only an active member of this group can become the Organizer');
  if (target.role === 'owner') throw fail(400, 'That member is already the Organizer');
  if (target.role !== 'member') throw fail(409, 'One person cannot hold two officer roles — revoke their current role first');
  if (target.members?.verification_status !== 'verified') throw fail(409, 'The new Organizer must have a verified account');
  return target;
}

/** Steps 3–4 (and A1): save the request as pending and tell the chosen member. */
async function sendRequest({ groupId, fromMemberId, toMemberId, reason, requestedBy, bySysadmin = false, problemReportId = null }) {
  const why = String(reason ?? '').trim();
  if (!why) throw fail(400, 'Give a reason for the hand-over'); // E5
  const target = await checkTarget(groupId, toMemberId);
  if (await pendingFor(groupId)) throw fail(409, 'A hand-over request is already waiting — cancel it before sending another');

  const { data, error } = await supabase.from('organizer_handovers').insert({
    group_id: groupId,
    from_member_id: fromMemberId,
    to_member_id: toMemberId,
    reason: why,
    requested_by: requestedBy,
    by_sysadmin: bySysadmin,
    problem_report_id: problemReportId,
  }).select(SELECT).single();
  if (error) throw error;

  await notify({
    memberId: toMemberId, groupId, type: 'handover.requested',
    title: 'You’ve been asked to be the Organizer',
    message: bySysadmin
      ? `The system administrator asked you to take over as Organizer: ${why}`
      : `${data.from?.full_name ?? 'The Organizer'} wants to hand the group over to you: ${why}`,
  });
  return { request: data, targetName: target.members?.full_name ?? null };
}

/** A2: the Organizer withdraws the request before it's answered. */
async function cancelRequest(groupId, handoverId) {
  await expireOverdue(groupId);
  const { data, error } = await supabase
    .from('organizer_handovers').update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', handoverId).eq('group_id', groupId).eq('status', 'pending')
    .select(SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw fail(409, 'This request is no longer pending');
  await notify({
    memberId: data.to_member_id, groupId, type: 'handover.cancelled',
    title: 'Hand-over request cancelled',
    message: 'The request for you to become the Organizer was withdrawn.',
  });
  return data;
}

/** Step 5–6: the chosen member accepts — the role moves, and everyone is told. */
async function acceptRequest(groupId, handoverId, memberId) {
  await expireOverdue(groupId);
  const { data: before, error: readErr } = await supabase
    .from('organizer_handovers').select(SELECT).eq('id', handoverId).eq('group_id', groupId).maybeSingle();
  if (readErr) throw readErr;
  if (!before) throw fail(404, 'Hand-over request not found');

  const { error } = await supabase.rpc('accept_organizer_handover', { p_handover_id: handoverId, p_member_id: memberId });
  if (error) throw fail(409, error.message);

  const newName = before.to?.full_name ?? 'A member';
  const { data: everyone } = await supabase
    .from('memberships').select('member_id').eq('group_id', groupId).eq('status', 'active');
  await Promise.all((everyone ?? []).map((m) => notify({
    memberId: m.member_id, groupId,
    type: m.member_id === before.from_member_id ? 'handover.accepted' : 'membership.new_organizer',
    title: m.member_id === memberId ? 'You are now the Organizer' : `${newName} is now the Organizer`,
    message: m.member_id === memberId
      ? 'Pending approvals — membership requests, loan requests, reversals and the distribution — are now yours.'
      : m.member_id === before.from_member_id
        ? `${newName} accepted your hand-over. You're now a regular member and can leave the group if you want.`
        : `${newName} took over as the group's Organizer.`,
  })));
  return { request: { ...before, status: 'accepted' }, previousOrganizer: before.from_member_id };
}

/** E1: the chosen member says no — the Organizer keeps the role. */
async function declineRequest(groupId, handoverId, memberId) {
  await expireOverdue(groupId);
  const { data, error } = await supabase
    .from('organizer_handovers').update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', handoverId).eq('group_id', groupId).eq('to_member_id', memberId).eq('status', 'pending')
    .select(SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw fail(409, 'This request is no longer pending');
  if (data.from_member_id) {
    await notify({
      memberId: data.from_member_id, groupId, type: 'handover.declined',
      title: 'Hand-over declined',
      message: `${data.to?.full_name ?? 'The member'} declined to become the Organizer. You keep the role and can choose someone else.`,
    });
  }
  return data;
}

/** A1: the Sysadmin's view of a group — names and roles only, no money. */
async function adminView(groupId) {
  const [{ members }, pending, owner] = await Promise.all([
    options(groupId),
    pendingFor(groupId),
    supabase.from('memberships').select('member_id, members!member_id(full_name)').eq('group_id', groupId).eq('role', 'owner').maybeSingle(),
  ]);
  if (owner.error) throw owner.error;
  return {
    organizer: owner.data ? { member_id: owner.data.member_id, full_name: owner.data.members?.full_name ?? null } : null,
    members: members.map(({ member_id, full_name, role, eligible, blocked }) => ({ member_id, full_name, role, eligible, blocked })),
    pending,
  };
}

module.exports = { currentRequest, options, sendRequest, cancelRequest, acceptRequest, declineRequest, adminView };
