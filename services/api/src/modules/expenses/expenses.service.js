// services/api/src/modules/expenses/expenses.service.js
// KapitPondo — Expenses service (M7, FINAL)

const supabase = require('../../config/supabase');
const { withSignedProof } = require('../../lib/proofUrl');

async function createExpense(input) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      group_id: input.groupId,
      amount: input.amount,
      category: input.category,
      description: input.description,
      proof_url: input.proofUrl,
      recorded_by: input.recordedBy,
      status: 'submitted',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listExpenses({ groupId, status }) {
  let q = supabase.from('expenses')
    .select('*, recorder:members!recorded_by(full_name), approver:members!approved_by(full_name)')
    .eq('group_id', groupId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return withSignedProof(data);
}

async function getExpense(id) {
  const { data, error } = await supabase.from('expenses').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function approveExpense({ expenseId, approverId }) {
  const { data, error } = await supabase.rpc('approve_expense', {
    p_expense_id: expenseId,
    p_approver_id: approverId,
  });
  if (error) throw error;
  return data;
}

async function rejectExpense(expenseId, reason) {
  const { data, error } = await supabase
    .from('expenses')
    .update({ status: 'rejected', rejection_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('status', 'submitted')
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  createExpense, listExpenses, getExpense, approveExpense, rejectExpense,
};