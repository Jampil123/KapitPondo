const supabase = require('../../config/supabase');

// A cycle created while the group has no other active cycle becomes Active
// immediately (TC-011: one "Save" step, not a separate activate call). If one
// is already active, this one is created as `draft` instead of erroring
// (TC-012: "forces the new cycle into Setup until the current one is Closed")
// — the unique index on cycles(group_id) where status='active' still backstops
// this against a race between the check and the insert.
async function createCycle(input) {
  const { data: existingActive } = await supabase
    .from('cycles')
    .select('id')
    .eq('group_id', input.groupId)
    .eq('status', 'active')
    .maybeSingle();

  const { data, error } = await supabase
    .from('cycles')
    .insert({
      group_id: input.groupId,
      name: input.name,
      contribution_amount: input.contributionAmount,
      frequency: input.frequency || 'monthly',
      penalty_amount: input.penaltyAmount || 0,
      penalty_type: input.penaltyType || 'fixed',
      start_date: input.startDate,
      end_date: input.endDate || null,
      contribution_due_day: input.contributionDueDay ?? null,
      default_interest_rate: input.defaultInterestRate ?? null,
      minimum_loan_amount: input.minimumLoanAmount ?? null,
      early_termination_penalty: input.earlyTerminationPenalty ?? null,
      status: existingActive ? 'draft' : 'active',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listCycles(groupId) {
  const { data, error } = await supabase
    .from('cycles').select('*').eq('group_id', groupId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data;
}

// Activate a draft cycle (the partial unique index enforces one active per group)
async function activateCycle(cycleId) {
  const { data, error } = await supabase
    .from('cycles')
    .update({ status: 'active' })
    .eq('id', cycleId)
    .eq('status', 'draft')
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function closeCycle(cycleId) {
  const { data, error } = await supabase.rpc('close_cycle', { p_cycle_id: cycleId });
  if (error) throw error;
  return data;
}

async function cycleProgress(cycleId) {
  const { data, error } = await supabase.rpc('cycle_progress', { p_cycle_id: cycleId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

module.exports = { createCycle, listCycles, activateCycle, closeCycle, cycleProgress };