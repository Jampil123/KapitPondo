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
  return withSignedProof(data);
}

async function getContribution(id) {
  const { data, error } = await supabase
    .from('contributions').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Officer recording a WALK-IN member's cash/GCash payment (TC-018) — the
// officer already physically confirmed the payment by receiving it, so this
// posts straight to the ledger (status 'approved') via record_walkin_
// contribution(), instead of the normal submitted → separate-officer-
// approves flow used for a member's own self-submission.
async function recordWalkInContribution(input) {
  const { data, error } = await supabase.rpc('record_walkin_contribution', {
    p_membership_id: input.membershipId,
    p_cycle_id: input.cycleId,
    p_group_id: input.groupId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod ?? null,
    p_external_reference: input.externalReference ?? null,
    p_officer_id: input.officerId,
  });
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

module.exports = {
  createContribution, recordWalkInContribution, listContributions, getContribution, getActiveMembership,
  approveContribution, rejectContribution,
};