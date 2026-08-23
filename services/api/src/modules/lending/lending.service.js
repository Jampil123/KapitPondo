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
  // approver is who made the decision; membership is who the loan actually
  // belongs to (the borrower) — officer review screens need the latter to
  // show whose request this is, not just who approved it.
  let q = supabase.from('loans')
    .select('*, approver:members!approved_by(full_name), membership:memberships!membership_id(member_id, members!member_id(full_name))')
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
    .select('*, approver:members!approved_by(full_name), membership:memberships!membership_id(member_id, members!member_id(full_name))')
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

  // A `contributions` row with status 'late' is a PERMANENT historical marker
  // (see penalties.service.js) — it never gets updated once the member catches
  // up, so checking it directly would flag someone forever after a single old
  // miss even if every cycle since has been paid on time. The `penalties` row
  // created alongside it DOES track resolution (pending/waived/paid), so check
  // that instead — only a still-*pending* penalty is a live, unresolved issue.
  const { data: pendingPenalties, error: pErr } = await supabase
    .from('penalties')
    .select('id')
    .eq('membership_id', loan.membership_id)
    .eq('status', 'pending')
    .limit(1);
  if (pErr) throw pErr;
  if (pendingPenalties?.length) reasons.push('Member has an unresolved late-contribution penalty');

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

// Member submits a repayment claim + proof — no money moves yet (see
// submit_loan_repayment()). Confirmed later by a DIFFERENT officer via
// confirmRepayment(), same "claim now, post on confirm" shape as a
// member's own contribution submission.
async function submitRepayment(input) {
  const { data, error } = await supabase.rpc('submit_loan_repayment', {
    p_loan_id: input.loanId,
    p_amount: input.amount,
    p_recorded_by: input.recordedBy,
    p_payment_method: input.paymentMethod || null,
    p_proof_url: input.proofUrl || null,
    p_external_reference: input.externalReference || null,
  });
  if (error) throw error;
  return data;
}

// Group-wide repayment list (across all the group's loans) — the officer's
// "pending repayments to confirm" queue, and a member's own repayment
// history/status. loan_payments has no group_id of its own, so this joins
// through loans (!inner so the .eq('loans.group_id', ...) filter actually
// scopes the query instead of just embedding).
async function listRepayments({ groupId, membershipId, role, status }) {
  let q = supabase
    .from('loan_payments')
    .select('*, recorder:members!recorded_by(full_name), verifier:members!approved_by(full_name), loans!inner(id, group_id, membership_id, membership:memberships!membership_id(member_id, members!member_id(full_name)))')
    .eq('loans.group_id', groupId);
  if (role === 'member') q = q.eq('loans.membership_id', membershipId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return withSignedProof(data);
}

async function getRepayment(paymentId) {
  const { data, error } = await supabase
    .from('loan_payments')
    .select('*, loans!inner(id, group_id, membership_id)')
    .eq('id', paymentId)
    .single();
  if (error) throw error;
  return data;
}

async function notifyRepaymentOutcome(loanId, { type, title, message }) {
  const { data: loan } = await supabase.from('loans').select('membership_id, group_id').eq('id', loanId).maybeSingle();
  if (!loan) return;
  const { data: membership } = await supabase.from('memberships').select('member_id').eq('id', loan.membership_id).maybeSingle();
  if (!membership) return;
  await notify({ memberId: membership.member_id, groupId: loan.group_id, type, title, message });
}

// A DIFFERENT officer confirms a member's submitted repayment claim — posts
// the ledger credit and updates the loan balance (see confirm_loan_repayment()).
async function confirmRepayment({ paymentId, approverId }) {
  const before = await getRepayment(paymentId);
  const { data, error } = await supabase.rpc('confirm_loan_repayment', {
    p_payment_id: paymentId,
    p_approver_id: approverId,
  });
  if (error) throw error;

  await notifyRepaymentOutcome(before.loan_id, {
    type: 'loan.repayment_confirmed',
    title: 'Repayment confirmed',
    message: `Your repayment of ${before.amount} was confirmed.`,
  });

  return data;
}

// Officer declines a submitted repayment claim (e.g. proof doesn't match).
async function rejectRepayment({ paymentId, reason }) {
  const { data, error } = await supabase
    .from('loan_payments')
    .update({ status: 'rejected', rejection_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'submitted')
    .select()
    .single();
  if (error) throw error;

  if (data) {
    await notifyRepaymentOutcome(data.loan_id, {
      type: 'loan.repayment_rejected',
      title: 'Repayment rejected',
      message: reason ? `Your repayment claim was rejected: ${reason}` : 'Your repayment claim was rejected.',
    });
  }

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
  submitRepayment,
  listRepayments,
  getRepayment,
  confirmRepayment,
  rejectRepayment,
  rejectLoan,
};
