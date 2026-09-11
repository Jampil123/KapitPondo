const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

// Backend has service-role key so it can INSERT directly — no RPC needed.
// (The client-facing RPC uses auth.uid() which doesn't work with service role.)
async function createGroup({ name, fundCode, description, ownerMemberId }) {
  // 1. Insert the group
  const { data: group, error: gErr } = await supabase
    .from('groups')
    .insert({
      name,
      fund_code: fundCode,
      description: description || null,
      owner_id: ownerMemberId,
    })
    .select()
    .single();
  if (gErr) throw gErr;

  // 2. Insert the owner membership atomically
  const { error: mErr } = await supabase
    .from('memberships')
    .insert({
      member_id: ownerMemberId,
      group_id:  group.id,
      role:      'owner',
      status:    'active',
      joined_at: new Date().toISOString(),
    });
  if (mErr) throw mErr;

  return group;
}

async function listMyGroups(memberId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, role, status, heads, joined_at, groups(*, owner:members!groups_owner_id_fkey(full_name))')
    .eq('member_id', memberId)
    .in('status', ['active', 'pending']);
  if (error) throw error;
  return data;
}

async function getGroup(groupId) {
  const { data, error } = await supabase
    .from('groups').select('*').eq('id', groupId).single();
  if (error) throw error;
  return data;
}

// =====================================================================
// GCash channel — Treasurer proposes, Owner approves (segregation of
// duties: the Treasurer receives the money, so they can't be the one who
// unilaterally decides what number members see — see migration 0056).
// treasurer_gcash_number/name stay the LIVE, member-visible values; the
// treasurer_gcash_pending_*/status columns track the one proposal "in
// flight" at a time. Full history is read from audit_log, not stored here.
// =====================================================================

async function submitGcashProposal(groupId, { number, name, note, qrUrl, submittedBy }) {
  const { data: current, error: cErr } = await supabase
    .from('groups').select('treasurer_gcash_status').eq('id', groupId).single();
  if (cErr) throw cErr;
  if (current.treasurer_gcash_status === 'pending') {
    throw Object.assign(new Error("A submission is already pending the Owner's review"), { status: 409 });
  }

  const { data, error } = await supabase
    .from('groups')
    .update({
      treasurer_gcash_status: 'pending',
      treasurer_gcash_pending_number: number,
      treasurer_gcash_pending_name: name,
      treasurer_gcash_pending_qr_url: qrUrl ?? null,
      treasurer_gcash_note: note ?? null,
      treasurer_gcash_rejection_reason: null,
      treasurer_gcash_submitted_by: submittedBy,
      treasurer_gcash_submitted_at: new Date().toISOString(),
      treasurer_gcash_reviewed_by: null,
      treasurer_gcash_reviewed_at: null,
    })
    .eq('id', groupId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// The Treasurer withdraws their own pending submission — reverts to
// 'approved' if a live number already existed before this proposal, else
// 'unset' (there was never one).
async function cancelGcashProposal(groupId, actorId) {
  const { data: current, error: cErr } = await supabase
    .from('groups')
    .select('treasurer_gcash_status, treasurer_gcash_submitted_by, treasurer_gcash_number')
    .eq('id', groupId).single();
  if (cErr) throw cErr;
  if (current.treasurer_gcash_status !== 'pending') {
    throw Object.assign(new Error('No pending submission to cancel'), { status: 409 });
  }
  if (current.treasurer_gcash_submitted_by !== actorId) {
    throw Object.assign(new Error('Only the Treasurer who submitted this can cancel it'), { status: 403 });
  }

  const { data, error } = await supabase
    .from('groups')
    .update({
      treasurer_gcash_status: current.treasurer_gcash_number ? 'approved' : 'unset',
      treasurer_gcash_pending_number: null,
      treasurer_gcash_pending_name: null,
      treasurer_gcash_pending_qr_url: null,
      treasurer_gcash_note: null,
    })
    .eq('id', groupId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Owner approves — the pending number/name/QR become the LIVE ones members see.
async function approveGcashProposal(groupId, approverId) {
  const { data: group, error: gErr } = await supabase.from('groups').select('*').eq('id', groupId).single();
  if (gErr) throw gErr;
  if (group.treasurer_gcash_status !== 'pending') {
    throw Object.assign(new Error('No pending submission to approve'), { status: 409 });
  }

  const { data, error } = await supabase
    .from('groups')
    .update({
      treasurer_gcash_number: group.treasurer_gcash_pending_number,
      treasurer_gcash_name: group.treasurer_gcash_pending_name,
      treasurer_gcash_qr_url: group.treasurer_gcash_pending_qr_url,
      treasurer_gcash_status: 'approved',
      treasurer_gcash_pending_number: null,
      treasurer_gcash_pending_name: null,
      treasurer_gcash_pending_qr_url: null,
      treasurer_gcash_note: null,
      treasurer_gcash_reviewed_by: approverId,
      treasurer_gcash_reviewed_at: new Date().toISOString(),
    })
    .eq('id', groupId)
    .select()
    .single();
  if (error) throw error;
  return { group: data, submittedBy: group.treasurer_gcash_submitted_by };
}

// Owner rejects — pending fields stay put so the Treasurer can see exactly
// what was rejected (matches the "what to fix" view), only the status +
// reason change.
async function rejectGcashProposal(groupId, approverId, reason) {
  const { data: current, error: cErr } = await supabase
    .from('groups').select('treasurer_gcash_status, treasurer_gcash_submitted_by').eq('id', groupId).single();
  if (cErr) throw cErr;
  if (current.treasurer_gcash_status !== 'pending') {
    throw Object.assign(new Error('No pending submission to reject'), { status: 409 });
  }

  const { data, error } = await supabase
    .from('groups')
    .update({
      treasurer_gcash_status: 'rejected',
      treasurer_gcash_rejection_reason: reason,
      treasurer_gcash_reviewed_by: approverId,
      treasurer_gcash_reviewed_at: new Date().toISOString(),
    })
    .eq('id', groupId)
    .select()
    .single();
  if (error) throw error;
  return { group: data, submittedBy: current.treasurer_gcash_submitted_by };
}

// Change history for the GCash channel — Treasurer (their own proposals)
// and Owner. Reads audit_log directly rather than going through
// auditlog.service's listAuditLog (that endpoint is Auditor/Owner-only by
// design, and this needs to be readable by the Treasurer too).
async function listGcashHistory(groupId) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*, actor:members!actor_id(full_name)')
    .eq('group_id', groupId)
    .eq('entity_type', 'group_gcash')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

// Resolve group by fund_code then insert a pending membership
async function joinByCode({ memberId, fundCode }) {
  // Find the group
  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select('id, name')
    .ilike('fund_code', fundCode)
    .eq('status', 'active')
    .maybeSingle();
  if (gErr) throw gErr;
  if (!group) throw Object.assign(new Error(`No active group found with code "${fundCode}".`), { status: 404 });

  // (member_id, group_id) is unique at the DB level, so a prior rejected/exited
  // row must be revived with an UPDATE rather than blocked or re-inserted.
  const { data: existing } = await supabase
    .from('memberships')
    .select('id, status')
    .eq('member_id', memberId)
    .eq('group_id', group.id)
    .maybeSingle();

  if (existing && ['pending', 'active', 'suspended'].includes(existing.status)) {
    throw Object.assign(new Error('You are already a member of this group.'), { code: '23505' });
  }

  if (existing) {
    // Rejected or exited before — resubmitting revives the same row as a fresh request.
    const { data: membership, error: uErr } = await supabase
      .from('memberships')
      .update({ status: 'pending', role: 'member', rejection_reason: null, joined_at: null })
      .eq('id', existing.id)
      .select()
      .single();
    if (uErr) throw uErr;
    return { membership, group };
  }

  // Insert pending membership
  const { data: membership, error: mErr } = await supabase
    .from('memberships')
    .insert({ member_id: memberId, group_id: group.id, role: 'member', status: 'pending' })
    .select()
    .single();
  if (mErr) throw mErr;

  return { membership, group };
}

async function listPendingMembers(groupId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, member_id, role, status, created_at, members!memberships_member_id_fkey(id, full_name, email, verification_status)')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function approveMember(groupId, memberId) {
  const { data, error } = await supabase
    .from('memberships')
    .update({ status: 'active', joined_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .eq('status', 'pending')
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function rejectMember(groupId, memberId, reason) {
  const { data, error } = await supabase
    .from('memberships')
    .update({ status: 'rejected', rejection_reason: reason ?? null })
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .eq('status', 'pending')
    .select()
    .single();
  if (error) throw error;
  if (data) {
    await notify({
      memberId,
      groupId,
      type: 'membership.rejected',
      title: 'Join request rejected',
      message: reason ? `Your request to join this group was rejected: ${reason}` : 'Your request to join this group was rejected.',
    });
  }
  return data;
}

async function listGroupMembers(groupId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, member_id, role, status, heads, joined_at, members!memberships_member_id_fkey(id, full_name, email, verification_status)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data;
}

// Member-safe officers list — any active member may see who runs their group
// (name + role only, no email/phone), separate from the officer-only full
// member list. Also returns the group's total active-member count, since that
// too is an aggregate figure rather than any one member's individual data.
async function listOfficers(groupId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, members!memberships_member_id_fkey(full_name, verification_status)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .neq('role', 'member')
    .order('role', { ascending: true });
  if (error) throw error;

  const { count, error: countErr } = await supabase
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('status', 'active');
  if (countErr) throw countErr;

  return {
    // verified is a plain boolean here, not the raw verification_status —
    // member-safe rows stay minimal (name + role + duty context), same
    // reasoning as leaving out email/phone.
    officers: data.map((m) => ({ role: m.role, full_name: m.members?.full_name ?? null, verified: m.members?.verification_status === 'verified' })),
    member_count: count ?? 0,
  };
}

// Member-safe directory — every active member's name + role + heads (no
// email/phone/verification_status), unlike listGroupMembers (officer-only).
// heads is included because it determines year-end profit share — every
// member has a legitimate interest in seeing it, unlike payment history.
async function listMemberDirectory(groupId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('member_id, role, heads, members!memberships_member_id_fkey(full_name)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data.map((m) => ({ member_id: m.member_id, role: m.role, heads: m.heads, full_name: m.members?.full_name ?? null }));
}

async function updateMemberRole(groupId, memberId, role) {
  if (role === 'treasurer' || role === 'auditor') {
    const { data: member, error: memberErr } = await supabase
      .from('members').select('verification_status').eq('id', memberId).single();
    if (memberErr) throw memberErr;
    if (member.verification_status !== 'verified') {
      throw Object.assign(new Error('Member must be verified before being appointed an officer'), { status: 409 });
    }
  }

  // Fetch the role BEFORE updating — .update().select() only ever returns
  // the new row, and the audit log needs the actual before value, not an
  // assumption about what it must have been.
  const { data: before } = await supabase
    .from('memberships').select('role')
    .eq('group_id', groupId).eq('member_id', memberId).maybeSingle();

  const { data, error } = await supabase
    .from('memberships')
    .update({ role })
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .neq('role', 'owner')
    .eq('status', 'active')
    .select()
    .single();
  if (error) throw error;

  if (data) {
    const ROLE_LABEL = { member: 'Member', treasurer: 'Treasurer', auditor: 'Auditor' };
    await notify({
      memberId,
      groupId,
      type: 'membership.role_changed',
      title: 'Your role changed',
      message: `You are now a ${ROLE_LABEL[role] ?? role} in this group.`,
    });
  }

  return { membership: data, previousRole: before?.role ?? null };
}

// An officer pings a specific member who's behind — the only officer-
// initiated notification in this module; every other notify() call here is
// an automatic side effect of a state change (approve/reject/role change).
async function nudgeMember(groupId, memberId) {
  const { data: membership, error } = await supabase
    .from('memberships')
    .select('member_id')
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!membership) throw Object.assign(new Error('Member not found in this group'), { status: 404 });

  await notify({
    memberId,
    groupId,
    type: 'balance.nudge',
    title: 'A reminder from your group',
    message: 'An officer noticed your contribution is behind. Please settle it when you can.',
  });
}

async function removeMember(groupId, memberId) {
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'exited' })
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .neq('role', 'owner');
  if (error) throw error;
}

// Self-service: a member leaves their own group. Blocked while they have an
// active/approved loan or an unresolved late-contribution penalty — same
// checks lending.service.js's checkEligibilityForMembership runs before a
// loan, kept as separate small queries here rather than importing across
// modules for two simple selects. Owner is blocked entirely — leaving would
// orphan the group; ownership transfer isn't a feature yet.
async function checkLeaveBlockers(membershipId) {
  const reasons = [];

  const { data: activeLoans, error: lErr } = await supabase
    .from('loans')
    .select('id')
    .eq('membership_id', membershipId)
    .in('status', ['approved', 'active']);
  if (lErr) throw lErr;
  if (activeLoans?.length) reasons.push('You have an active loan — settle it before leaving.');

  const { data: pendingPenalties, error: pErr } = await supabase
    .from('penalties')
    .select('id')
    .eq('membership_id', membershipId)
    .eq('status', 'pending');
  if (pErr) throw pErr;
  if (pendingPenalties?.length) reasons.push('You have an unresolved late-contribution penalty — settle it before leaving.');

  return reasons;
}

async function leaveGroup(groupId, memberId) {
  const { data: membership, error: mErr } = await supabase
    .from('memberships')
    .select('id, role, status')
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!membership || membership.status !== 'active') {
    throw Object.assign(new Error('You are not an active member of this group.'), { status: 404 });
  }
  if (membership.role === 'owner') {
    throw Object.assign(new Error('The Owner cannot leave the group. Transfer ownership first.'), { status: 409 });
  }

  const reasons = await checkLeaveBlockers(membership.id);
  if (reasons.length) {
    throw Object.assign(new Error(reasons.join(' ')), { status: 409 });
  }

  const { data, error } = await supabase
    .from('memberships')
    .update({ status: 'exited' })
    .eq('id', membership.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  createGroup, listMyGroups, getGroup, joinByCode, listPendingMembers, approveMember, rejectMember,
  listGroupMembers, listOfficers, listMemberDirectory, updateMemberRole, removeMember, leaveGroup, nudgeMember,
  submitGcashProposal, cancelGcashProposal, approveGcashProposal, rejectGcashProposal, listGcashHistory,
};
