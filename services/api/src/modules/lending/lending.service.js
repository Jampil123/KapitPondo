// services/api/src/modules/lending/lending.service.js
// KapitPondo — Lending service (FINAL)
// Talks to Supabase; the money-critical operations call SQL functions.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { withSignedProof } = require('../../lib/proofUrl');
const { loadHeadNames, attachHeadNames } = require('../../lib/headNames');

const OPEN_STATUSES = ['pending', 'approved', 'active'];

// Member applies — no interest rate here; the officer sets it at approval.
// Each head is its own loan slot (migration 0065): the loan is filed against
// one of the member's heads, which must exist and not already have a loan in
// progress. The unique index loans_one_open_per_head backs this up if two
// requests race.
async function applyForLoan(input) {
  const headNo = input.headNo == null ? 1 : Number(input.headNo);
  const { heads, slots } = await headSlots(input.membershipId);
  if (!Number.isInteger(headNo) || headNo < 1 || headNo > heads) {
    throw Object.assign(new Error(`Pick a head between 1 and ${heads}`), { status: 400 });
  }
  if (slots.find((s) => s.head_no === headNo)?.loan_id) {
    throw Object.assign(new Error(`Head ${headNo} already has a loan in progress`), { status: 409 });
  }
  const { data, error } = await supabase
    .from('loans')
    .insert({
      membership_id: input.membershipId,
      group_id: input.groupId,
      principal: input.principal,
      term_months: input.termMonths,
      purpose: input.purpose,
      head_no: headNo,
      status: 'pending',
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw Object.assign(new Error(`Head ${headNo} already has a loan in progress`), { status: 409 });
    throw error;
  }
  return data;
}

// Every head of a membership and the loan (if any) currently occupying it.
async function headSlots(membershipId) {
  const { data: membership, error: mErr } = await supabase
    .from('memberships').select('heads').eq('id', membershipId).single();
  if (mErr) throw mErr;
  const { data: open, error: lErr } = await supabase
    .from('loans').select('id, head_no, status')
    .eq('membership_id', membershipId)
    .in('status', OPEN_STATUSES);
  if (lErr) throw lErr;
  const names = await loadHeadNames([membershipId]);
  const heads = Math.max(1, membership.heads ?? 1);
  const slots = Array.from({ length: heads }, (_, i) => {
    const headNo = i + 1;
    const loan = (open ?? []).find((l) => l.head_no === headNo) ?? null;
    return { head_no: headNo, name: names.get(`${membershipId}:${headNo}`) ?? null, loan_id: loan?.id ?? null, loan_status: loan?.status ?? null };
  });
  return { heads, slots };
}

// Member-safe list of who's borrowing right now — name, head, amount and
// status only. No rate, balance or repayment detail; loan releases are
// already public by name in the group ledger.
async function listBorrowers(groupId) {
  const { data, error } = await supabase
    .from('loans')
    .select('id, membership_id, head_no, principal, approved_principal, status, disbursed_at, applied_at, membership:memberships!membership_id(heads, members!member_id(full_name, avatar_url))')
    .eq('group_id', groupId)
    .in('status', ['approved', 'active'])
    .order('applied_at', { ascending: false });
  if (error) throw error;
  await attachHeadNames(data ?? []);
  return (data ?? []).map((l) => ({
    loan_id: l.id,
    membership_id: l.membership_id,
    full_name: l.membership?.members?.full_name ?? null,
    avatar_url: l.membership?.members?.avatar_url ?? null,
    heads: l.membership?.heads ?? 1,
    head_no: l.head_no,
    head_name: l.head_name,
    amount: l.approved_principal ?? l.principal,
    status: l.status,
    disbursed_at: l.disbursed_at,
  }));
}

async function listLoans({ groupId, membershipId, role, status }) {
  // approver/disburser are who made each decision — two separate officers,
  // two separate columns (see migration 0026); membership is who the loan
  // actually belongs to (the borrower) — officer review screens need the
  // latter to show whose request this is, not just who decided it.
  let q = supabase.from('loans')
    .select('*, approver:members!approved_by(full_name), disburser:members!disbursed_by(full_name), membership:memberships!membership_id(member_id, role, heads, members!member_id(full_name, avatar_url))')
    .eq('group_id', groupId);
  if (role === 'member') q = q.eq('membership_id', membershipId); // members see only their own
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return attachHeadNames(data ?? []);
}

async function getLoan(id) {
  const { data, error } = await supabase
    .from('loans')
    .select('*, approver:members!approved_by(full_name), disburser:members!disbursed_by(full_name), membership:memberships!membership_id(member_id, role, heads, members!member_id(full_name, avatar_url))')
    .eq('id', id).single();
  if (error) throw error;
  return attachHeadNames(data);
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

// TC-014 / TC-034: what the Owner is meant to "review" before deciding — and
// (checkEligibilityForMembership) also what a member is shown BEFORE they
// even apply, so a blocked member learns why from their own screen rather
// than from a rejection. Liquidity is checked separately (inside
// approve_loan/disburse_loan, against whatever amount is actually being
// approved) since TC-040 lets the Owner approve a smaller amount rather than
// being flatly blocked by it — the checks here are the ones that make a
// loan ineligible outright, regardless of amount.
async function checkEligibilityForMembership(membershipId, excludeLoanId = null) {
  const { data: membership, error: mErr } = await supabase
    .from('memberships')
    .select('member_id, members!member_id(verification_status)')
    .eq('id', membershipId)
    .single();
  if (mErr) throw mErr;

  const reasons = [];
  if (membership.members.verification_status !== 'verified') {
    reasons.push('Member is not verified');
  }

  // One loan per head (migration 0065). Deciding on an existing loan never
  // trips this — that loan already holds its own slot, and the unique index
  // keeps any other loan off it — so it only gates a NEW request.
  if (!excludeLoanId) {
    const { slots } = await headSlots(membershipId);
    if (slots.every((s) => s.loan_id)) reasons.push('Every head already has a loan in progress');
  }

  // A `contributions` row with status 'late' is a PERMANENT historical marker
  // (see penalties.service.js) — it never gets updated once the member catches
  // up, so checking it directly would flag someone forever after a single old
  // miss even if every cycle since has been paid on time. The `penalties` row
  // created alongside it DOES track resolution (pending/waived/paid), so check
  // that instead — only a still-*pending* penalty is a live, unresolved issue.
  const { data: pendingPenalties, error: pErr } = await supabase
    .from('penalties')
    .select('id')
    .eq('membership_id', membershipId)
    .eq('status', 'pending')
    .limit(1);
  if (pErr) throw pErr;
  if (pendingPenalties?.length) reasons.push('Member has an unresolved late-contribution penalty');

  return { eligible: reasons.length === 0, reasons };
}

async function checkEligibility(loanId) {
  const loan = await getLoan(loanId);
  const { eligible, reasons } = await checkEligibilityForMembership(loan.membership_id, loanId);
  return { eligible, reasons, loan };
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

// A member's own claim, or an officer recording one on the borrower's
// behalf (isWalkIn) — either way no money moves yet (see
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
    p_is_walk_in: input.isWalkIn ?? false,
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
    .select('*, recorder:members!recorded_by(full_name), verifier:members!approved_by(full_name), loans!inner(id, group_id, membership_id, membership:memberships!membership_id(member_id, members!member_id(full_name, avatar_url)))')
    .eq('loans.group_id', groupId);
  if (role === 'member') q = q.eq('loans.membership_id', membershipId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return withSignedProof(data);
}

// Same shape as contributions.service.js's hasDuplicateReference, joined
// through loans since loan_payments has no group_id of its own (same
// !inner-join reasoning as listRepayments above). Status-agnostic, matching
// contributions' existing behavior — any row with that reference counts.
async function hasDuplicateExternalReference(groupId, externalReference) {
  const { data, error } = await supabase
    .from('loan_payments')
    .select('id, loans!inner(group_id)')
    .eq('loans.group_id', groupId)
    .eq('external_reference', externalReference)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
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

// The borrower withdraws their own request — only while it's still 'pending'
// (nobody's decided on it yet). Distinct status from 'rejected' since that's
// an Owner decision; this is the member's own action.
async function cancelLoan(loanId, membershipId) {
  const { data, error } = await supabase
    .from('loans')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', loanId)
    .eq('membership_id', membershipId)
    .eq('status', 'pending')
    .select()
    .single();
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
  headSlots,
  listBorrowers,
  listLoans,
  getLoan,
  getLoanPayments,
  availableCash,
  checkEligibility,
  checkEligibilityForMembership,
  cancelLoan,
  approveLoan,
  disburseLoan,
  submitRepayment,
  listRepayments,
  hasDuplicateExternalReference,
  getRepayment,
  confirmRepayment,
  rejectRepayment,
  rejectLoan,
};
