// services/api/src/modules/distributions/distributions.service.js
// KapitPondo — Distributions service (M9, FINAL)

const supabase = require('../../config/supabase');

// Preview a year-end distribution (computes the split; no money moves yet)
async function previewDistribution({ groupId, period, declaredBy }) {
  const { data, error } = await supabase.rpc('preview_distribution', {
    p_group_id: groupId,
    p_period: period,
    p_declared_by: declaredBy,
  });
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

// Finalize: posts payouts, fund goes to 0
async function finalizeDistribution({ distributionId, finalizedBy }) {
  const { data, error } = await supabase.rpc('finalize_distribution', {
    p_distribution_id: distributionId,
    p_finalized_by: finalizedBy,
  });
  if (error) throw error;
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
  const { data, error } = await supabase
    .from('memberships')
    .update({ heads })
    .eq('id', membershipId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  previewDistribution,
  listDistributions,
  getDistribution,
  getAllocations,
  finalizeDistribution,
  cancelPreview,
  setHeads,
};