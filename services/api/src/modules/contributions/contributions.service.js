const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { withSignedProof } = require('../../lib/proofUrl');

// Used to validate an officer-supplied membership_id belongs to this group
// and is active before recording a contribution on that member's behalf.
async function getActiveMembership(membershipId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, group_id, member_id, status')
    .eq('id', membershipId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

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
      // Distinguishes an officer recording someone else's payment from a
      // member's own self-submission — both sit in the same 'submitted'
      // queue, but the app splits them into separate review tabs (see
      // contributions/confirm.tsx: Pending vs Awaiting Auditor) and the
      // wording differs ("Auditor verifies" vs "officer confirms").
      is_walk_in: input.isWalkIn ?? false,
      status: 'submitted',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listContributions({ groupId, membershipId, role, status, cycleId, filterMembershipId }) {
  let q = supabase.from('contributions')
    .select('*, recorder:members!recorded_by(full_name), approver:members!approved_by(full_name), memberships!membership_id(member_id, heads, members!member_id(full_name))')
    .eq('group_id', groupId);
  if (role === 'member') q = q.eq('membership_id', membershipId); // members see only their own
  else if (filterMembershipId) q = q.eq('membership_id', filterMembershipId); // officer explicitly scoping to one member
  if (status) q = q.eq('status', status);
  if (cycleId) q = q.eq('cycle_id', cycleId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return withSignedProof(data);
}

// Advisory duplicate check the client runs before submitting (same GCash
// reference number reused, whether by mistake or resubmission) — flags, never
// blocks; the officer reviewing still makes the actual call.
async function hasDuplicateReference(groupId, externalReference) {
  const { data, error } = await supabase
    .from('contributions')
    .select('id')
    .eq('group_id', groupId)
    .eq('external_reference', externalReference)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
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

async function rejectContribution({ contributionId, reason }) {
  const { data, error } = await supabase
    .from('contributions')
    .update({
      status: 'rejected',
      rejection_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contributionId)
    .eq('status', 'submitted')
    .select()
    .single();
  if (error) throw error;

  if (data) {
    // Notify the member whose contribution this is — not necessarily the
    // recorder, since an officer may have recorded it on their behalf (TC-018).
    const { data: membership } = await supabase
      .from('memberships').select('member_id, group_id').eq('id', data.membership_id).maybeSingle();
    if (membership) {
      await notify({
        memberId: membership.member_id,
        groupId: membership.group_id,
        type: 'contribution.rejected',
        title: 'Contribution rejected',
        message: reason ? `Your contribution was rejected: ${reason}` : 'Your contribution was rejected.',
      });
    }
  }

  return data;
}

// Called by the PayMongo webhook once a signed event confirms a checkout
// payment actually succeeded. Posts an already-approved contribution + its
// ledger credit in one shot — see 0051_paymongo_contributions.sql's
// auto_confirm_contribution() (mirrors record_walkin_contribution's shape)
// for exactly what this posts. Never call this from anything except a
// verified webhook — there's no human recorder/approver pair backing it.
async function autoConfirmContribution({ membershipId, cycleId, groupId, amount, gatewayProvider, gatewayReference, gatewayStatus, gatewayPayload }) {
  const { data, error } = await supabase.rpc('auto_confirm_contribution', {
    p_membership_id: membershipId,
    p_cycle_id: cycleId,
    p_group_id: groupId,
    p_amount: amount,
    p_gateway_provider: gatewayProvider,
    p_gateway_reference: gatewayReference,
    p_gateway_status: gatewayStatus || 'paid',
    p_gateway_payload: gatewayPayload || null,
  });
  if (error) throw error;
  return data;
}

module.exports = {
  createContribution, listContributions, getContribution, getActiveMembership,
  approveContribution, rejectContribution, autoConfirmContribution, hasDuplicateReference,
};