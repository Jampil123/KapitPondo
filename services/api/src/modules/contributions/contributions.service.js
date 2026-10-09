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

const round2 = (n) => Math.round(n * 100) / 100;
const IN_REVIEW = ['submitted', 'confirmed'];

// What a new payment from this member is for (0068). A period paid before
// their heads went up still owes the difference, and that balance is paid
// first, as a top-up of that period. Otherwise it's the next period, less
// any advance credit left from paying before their heads went down.
async function planPayment({ membershipId, cycleId }) {
  const [membership, cycle, rows] = await Promise.all([
    supabase.from('memberships').select('heads, contribution_credit').eq('id', membershipId).single(),
    supabase.from('cycles').select('contribution_amount').eq('id', cycleId).single(),
    supabase.from('contributions')
      .select('id, cycle_id, amount, amount_due, credit_applied, credit_granted, status, top_up_of, created_at')
      .eq('membership_id', membershipId),
  ]);
  for (const r of [membership, cycle, rows]) if (r.error) throw r.error;

  const cycleRows = rows.data.filter((r) => r.cycle_id === cycleId);
  const repriced = cycleRows
    .filter((r) => !r.top_up_of && r.status === 'approved' && r.amount_due != null)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const period of repriced) {
    const topUps = cycleRows.filter((t) => t.top_up_of === period.id);
    const toppedUp = topUps.filter((t) => t.status === 'approved').reduce((s, t) => s + Number(t.amount), 0);
    const covered = Number(period.amount) + Number(period.credit_applied) - Number(period.credit_granted) + toppedUp;
    const balance = round2(Number(period.amount_due) - covered);
    if (balance > 0) {
      return { topUpOf: period.id, balance, topUpInReview: topUps.some((t) => IN_REVIEW.includes(t.status)) };
    }
  }

  // Credit already earmarked by payments still in review isn't available twice.
  const reserved = rows.data
    .filter((r) => IN_REVIEW.includes(r.status))
    .reduce((s, r) => s + Number(r.credit_applied), 0);
  const available = Math.max(round2(Number(membership.data.contribution_credit) - reserved), 0);
  const expected = round2(Number(cycle.data.contribution_amount) * (membership.data.heads || 1));
  return { topUpOf: null, expected, creditApplied: Math.min(available, expected) };
}

// A period fully covered by advance credit — approved on the spot, since no money moves.
async function applyCredit({ membershipId, cycleId, amount, actorId }) {
  const { data, error } = await supabase.rpc('apply_contribution_credit', {
    p_membership_id: membershipId,
    p_cycle_id: cycleId,
    p_amount: amount,
    p_actor_id: actorId,
  });
  if (error) throw Object.assign(new Error(error.message), { status: 409 });
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
      penalty_applied: input.penaltyApplied ?? 0,
      top_up_of: input.topUpOf ?? null,
      credit_applied: input.creditApplied ?? 0,
      status: 'submitted',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Walk-in: recorded by the person who'd confirm it (usually the Treasurer
// taking cash in person), it's confirmed on recording and goes straight to
// "Pending verification" — never straight to the ledger (migration 0075).
async function recordWalkIn({ contributionId, recorderId }) {
  const { data, error } = await supabase.rpc('record_walk_in_contribution', {
    p_contribution_id: contributionId,
    p_recorder_id: recorderId,
  });
  if (error) throw error;
  return data;
}

async function listContributions({ groupId, membershipId, role, status, cycleId, filterMembershipId }) {
  let q = supabase.from('contributions')
    .select('*, recorder:members!recorded_by(full_name), approver:members!approved_by(full_name), memberships!membership_id(member_id, heads, members!member_id(full_name, avatar_url))')
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

// Step 1 — the fund holder confirms the money arrived. Posts nothing.
async function confirmContribution({ contributionId, confirmerId }) {
  const { data, error } = await supabase.rpc('confirm_contribution', {
    p_contribution_id: contributionId,
    p_confirmer_id: confirmerId,
  });
  if (error) throw error;
  return data;
}

// Step 2 — the independent check. This is what posts to the ledger.
async function verifyContribution({ contributionId, verifierId }) {
  const { data, error } = await supabase.rpc('verify_contribution', {
    p_contribution_id: contributionId,
    p_verifier_id: verifierId,
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
    // Either step can send it back: the confirmer, or the verifier after confirmation.
    .in('status', ['submitted', 'confirmed'])
    .select()
    .maybeSingle();
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
  createContribution, listContributions, getContribution, getActiveMembership, planPayment, applyCredit,
  confirmContribution, verifyContribution, rejectContribution, hasDuplicateReference,
  recordWalkIn,
};