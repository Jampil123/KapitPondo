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
    .select('role, status, groups(*)')
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
    .select('id, member_id, role, status, joined_at, members!memberships_member_id_fkey(id, full_name, email, verification_status)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data;
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
  return data;
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

module.exports = { createGroup, listMyGroups, getGroup, joinByCode, listPendingMembers, approveMember, rejectMember, listGroupMembers, updateMemberRole, removeMember };
