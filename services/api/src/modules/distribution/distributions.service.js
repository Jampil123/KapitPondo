const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

async function previewDistribution({ groupId, period, declaredBy }) {
  const { data, error } = await supabase.rpc('preview_distribution', {
    p_group_id: groupId,
    p_period: period,
    p_declared_by: declaredBy,
  });
  if (error) throw error;
  return data;
}

// Auditor verifies a previewed distribution — proceeds to the Owner for
// final approval (TC-027). finalize_distribution (migration 0028) requires
// this status, not just 'previewed'.
async function verifyDistribution({ distributionId, verifiedBy, notes }) {
  const { data, error } = await supabase
    .from('distributions')
    .update({
      status: 'verified',
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verify_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', distributionId)
    .eq('status', 'previewed')
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listDistributions(groupId) {
  const { data, error } = await supabase
    .from('distributions')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getDistribution(id) {
  const { data, error } = await supabase
    .from('distributions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// `caller` scopes the result for a plain member to their OWN allocation only —
// without it, a member could see every other member's name + share, which
// breaks the "members may not see other members' individual figures" rule.
async function getAllocations(distributionId, caller = {}) {
  let q = supabase
    .from('distribution_allocations')
    .select('*, memberships!membership_id(member_id, heads, members!member_id(full_name))')
    .eq('distribution_id', distributionId)
    .order('created_at', { ascending: true });
  if (caller.role === 'member') q = q.eq('membership_id', caller.membershipId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Finalize: posts payouts, fund goes to 0. Requires status 'verified' (see
// migration 0028) — an Auditor must have signed off first (TC-015).
async function finalizeDistribution({ distributionId, finalizedBy }) {
  const { data, error } = await supabase.rpc('finalize_distribution', {
    p_distribution_id: distributionId,
    p_finalized_by: finalizedBy,
  });
  if (error) throw error;

  // TC-015: "all members are notified"
  const allocations = await getAllocations(distributionId);
  for (const alloc of allocations) {
    const memberId = alloc.memberships?.member_id;
    if (!memberId) continue;
    await notify({
      memberId,
      groupId: data.group_id,
      type: 'distribution.finalized',
      title: 'Year-end distribution finalized',
      message: `Your share of ${data.period}'s year-end distribution (${alloc.amount}) has been posted.`,
    });
  }

  return data;
}

// Cancel a previewed distribution (deletes it and its allocations) so it can be re-run
async function cancelPreview(distributionId) {
  // allocations are removed by ON DELETE CASCADE on distribution_id
  const { data, error } = await supabase
    .from('distributions')
    .delete()
    .eq('id', distributionId)
    .eq('status', 'previewed')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Set how many heads a membership carries (owner action)
async function setHeads({ membershipId, heads }) {
  const { data: before } = await supabase
    .from('memberships').select('heads').eq('id', membershipId).maybeSingle();

  const { data, error } = await supabase
    .from('memberships')
    .update({ heads })
    .eq('id', membershipId)
    .select()
    .single();
  if (error) throw error;
  return { membership: data, previousHeads: before?.heads ?? null };
}

module.exports = {
  previewDistribution,
  verifyDistribution,
  listDistributions,
  getDistribution,
  getAllocations,
  finalizeDistribution,
  cancelPreview,
  setHeads,
};