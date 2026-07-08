// services/api/src/modules/lending/lending.service.js
// KapitPondo — Lending service (FINAL)
// Talks to Supabase; the money-critical operations call SQL functions.

const supabase = require('../../config/supabase');

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
  return data;
}

async function availableCash(groupId) {
  const { data, error } = await supabase.rpc('group_available_cash', { p_group_id: groupId });
  if (error) throw error;
  return data;
}

// Officer approves & disburses, supplying the monthly interest rate.
async function approveAndDisburse({ loanId, approverId, interestRate }) {
  const { data, error } = await supabase.rpc('approve_and_disburse_loan', {
    p_loan_id: loanId,
    p_approver_id: approverId,
    p_interest_rate: interestRate,
  });
  if (error) throw error;
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

async function rejectLoan(loanId) {
  const { data, error } = await supabase
    .from('loans')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', loanId)
    .eq('status', 'pending')
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  applyForLoan,
  listLoans,
  getLoan,
  getLoanPayments,
  availableCash,
  approveAndDisburse,
  recordRepayment,
  rejectLoan,
};