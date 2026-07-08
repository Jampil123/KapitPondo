const supabase = require('../../config/supabase');

async function createContribution(input) {
  const { data, error } = await supabase
    .from('contributions')
    .insert({
      membership_id: input.membershipId,
      cycle_id: input.cycleId,
      group_id: input.groupId,
      amount: input.amount,
      payment_method: input.paymentMethod,
      proof_url: input.proofUrl,
      external_reference: input.externalReference,
      recorded_by: input.recordedBy,
      status: 'submitted',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listContributions({ groupId, membershipId, role, status, cycleId }) {
  let q = supabase.from('contributions')
    .select('*, approver:members!approved_by(full_name)')
    .eq('group_id', groupId);
  if (role === 'member') q = q.eq('membership_id', membershipId); // members see only their own
  if (status) q = q.eq('status', status);
  if (cycleId) q = q.eq('cycle_id', cycleId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getContribution(id) {
  const { data, error } = await supabase
    .from('contributions').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function approveContribution({ contributionId, approverId }) {
  const { data, error } = await supabase.rpc('approve_contribution', {
    p_contribution_id: contributionId,
    p_approver_id: approverId,
  });
  if (error) throw error;
  return data;
}

async function rejectContribution({ contributionId }) {
  const { data, error } = await supabase
    .from('contributions')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', contributionId)
    .eq('status', 'submitted')
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  createContribution, listContributions, getContribution,
  approveContribution, rejectContribution,
};