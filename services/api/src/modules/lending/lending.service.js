// services/api/src/modules/lending/lending.service.js
// KapitPondo — Lending service (FINAL)
// Talks to Supabase; the money-critical operations call SQL functions.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { withSignedProof } = require('../../lib/proofUrl');

// Member applies — no interest rate here; the officer sets it at approval.
async function applyForLoan(input) {
  const { data, error } = await supabase
    .from('loans')
    .insert({
      membership_id: input.membershipId,
      group_id: input.groupId,
      principal: input.principal,
      term_months: input.termMonths,
      purpose: input.purpose,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listLoans({ groupId, membershipId, role, status }) {
  let q = supabase.from('loans')
    .select('*, approver:members!approved_by(full_name)')
    .eq('group_id', groupId);
  if (role === 'member') q = q.eq('membership_id', membershipId); // members see only their own
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getLoan(id) {
  const { data, error } = await supabase
    .from('loans')
    .select('*, approver:members!approved_by(full_name)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}

async function getLoanPayments(loanId) {
  const { data, error } = await supabase
    .from('loan_payments')
    .select('*, recorder:members!recorded_by(full_name), verifier:members!approved_by(full_name)')
    .eq('loan_id', loanId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return withSignedProof(data);
}

async function availableCash(groupId) {
  const { data, error } = await supabase.rpc('group_available_cash', { p_group_id: groupId });
  if (error) throw error;
  return data;
}

// TC-014 / TC-034: what the Owner is meant to "review" before deciding.
// Liquidity is checked separately (inside approve_loan/disburse_loan, against
// whatever amount is actually being approved) since TC-040 lets the Owner
// approve a smaller amount rather than being flatly blocked by it — the
// checks here are the ones that make a loan ineligible outright, regardless
// of amount.
async function checkEligibility(loanId) {
  const loan = await getLoan(loanId);

  const { data: membership, error: mErr } = await supabase
    .from('memberships')
    .select('member_id, members!member_id(verification_status)')
    .eq('id', loan.membership_id)
    .single();
  if (mErr) throw mErr;

  const reasons = [];
  if (membership.members.verification_status !== 'verified') {
    reasons.push('Member is not verified');
  }

  const { data: activeLoans, error: lErr } = await supabase
    .from('loans')
    .select('id')
    .eq('membership_id', loan.membership_id)
    .in('status', ['approved', 'active'])
    .neq('id', loanId);
  if (lErr) throw lErr;
  if (activeLoans?.length) reasons.push('Member already has an active loan');

  const { data: lateContributions, error: cErr } = await supabase
    .from('contributions')
    .select('id')
    .eq('membership_id', loan.membership_id)
    .eq('status', 'late')
    .limit(1);
  if (cErr) throw cErr;
  if (lateContributions?.length) reasons.push('Member has a missed contribution on file');

  return { eligible: reasons.length === 0, reasons, loan };
}

// Owner-only lending decision. p_approved_principal lets TC-040 approve less
// than requested when liquidity is short instead of only being able to
// block/reject outright.
async function approveLoan({ loanId, approverId, interestRate, approvedPrincipal }) {
  const { eligible, reasons } = await checkEligibility(loanId);
  if (!eligible) {
    throw Object.assign(new Error(reasons.join('; ')), { status: 409 });
  }
  const { data, error } = await supabase.rpc('approve_loan', {
    p_loan_id: loanId,
    p_approver_id: approverId,
    p_interest_rate: interestRate,
    p_approved_principal: approvedPrincipal ?? null,
  });
  if (error) throw error;

  const { data: membership } = await supabase
    .from('memberships').select('member_id').eq('id', data.membership_id).maybeSingle();
  if (membership) {
    await notify({
      memberId: membership.member_id,
      groupId: data.group_id,
      type: 'loan.approved',
      title: 'Loan approved',
      message: `Your loan request for ${data.approved_principal ?? data.principal} was approved and now awaits disbursement.`,
    });
  }

  return data;
}

// Treasurer or Owner: disburses an already-approved loan.
async function disburseLoan({ loanId, disburserId }) {
  const { data, error } = await supabase.rpc('disburse_loan', {
    p_loan_id: loanId,
    p_disburser_id: disburserId,
  });
  if (error) throw error;

  const { data: loan } = await supabase.from('loans').select('membership_id, group_id, outstanding_balance').eq('id', loanId).single();
  if (loan) {
    const { data: membership } = await supabase
      .from('memberships').select('member_id').eq('id', loan.membership_id).maybeSingle();
    if (membership) {
      await notify({
        memberId: membership.member_id,
        groupId: loan.group_id,
        type: 'loan.disbursed',
        title: 'Loan disbursed',
        message: `Your loan of ${loan.outstanding_balance} has been disbursed.`,
      });
    }
  }

  return data;
}

async function recordRepayment(input) {
  const { data, error } = await supabase.rpc('record_loan_repayment', {
    p_loan_id: input.loanId,
    p_amount: input.amount,
    p_recorded_by: input.recordedBy,
    p_approver_id: input.approverId,
    p_payment_method: input.paymentMethod || null,
    p_proof_url: input.proofUrl || null,
    p_external_reference: input.externalReference || null,
  });
  if (error) throw error;
  return data;
}

async function rejectLoan(loanId, reason) {
  const { data, error } = await supabase
    .from('loans')
    .update({ status: 'rejected', rejection_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq('id', loanId)
    .eq('status', 'pending')
    .select()
    .single();
  if (error) throw error;

  if (data) {
    const { data: membership } = await supabase
      .from('memberships').select('member_id').eq('id', data.membership_id).maybeSingle();
    if (membership) {
      await notify({
        memberId: membership.member_id,
        groupId: data.group_id,
        type: 'loan.rejected',
        title: 'Loan rejected',
        message: reason ? `Your loan request was rejected: ${reason}` : 'Your loan request was rejected.',
      });
    }
  }

  return data;
}

module.exports = {
  applyForLoan,
  listLoans,
  getLoan,
  getLoanPayments,
  availableCash,
  checkEligibility,
  approveLoan,
  disburseLoan,
  recordRepayment,
  rejectLoan,
};
