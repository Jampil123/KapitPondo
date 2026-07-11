const supabase = require('../../config/supabase');

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
    .select('id, role, status, heads, groups(*, owner:members!groups_owner_id_fkey(full_name))')
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

  // Guard duplicate
  const { data: existing } = await supabase
    .from('memberships')
    .select('id, status')
    .eq('member_id', memberId)
    .eq('group_id', group.id)
    .maybeSingle();
  if (existing) throw Object.assign(new Error('You are already a member of this group.'), { code: '23505' });

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

async function rejectMember(groupId, memberId) {
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .eq('status', 'pending');
  if (error) throw error;
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

// Member-safe officers list — any active member may see who runs their group
// (name + role only, no email/phone), separate from the officer-only full
// member list. Also returns the group's total active-member count, since that
// too is an aggregate figure rather than any one member's individual data.
async function listOfficers(groupId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, members!memberships_member_id_fkey(full_name)')
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
    officers: data.map((m) => ({ role: m.role, full_name: m.members?.full_name ?? null })),
    member_count: count ?? 0,
  };
}

// Member-safe directory — every active member's name + role (no email/phone),
// unlike listGroupMembers (officer-only, includes email/verification_status).
async function listMemberDirectory(groupId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, members!memberships_member_id_fkey(full_name)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data.map((m) => ({ role: m.role, full_name: m.members?.full_name ?? null }));
}

async function updateMemberRole(groupId, memberId, role) {
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

module.exports = { createGroup, listMyGroups, getGroup, joinByCode, listPendingMembers, approveMember, rejectMember, listGroupMembers, listOfficers, listMemberDirectory, updateMemberRole, removeMember };
