const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

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

async function cycleInGroup(groupId, cycleId) {
  const { data, error } = await supabase.from('cycles').select('id, group_id, name, status').eq('id', cycleId).maybeSingle();
  if (error) throw error;
  if (!data || data.group_id !== groupId) throw Object.assign(new Error('Cycle not found in this group'), { status: 404 });
  return data;
}

// What still stops the cycle from closing (UC-FC-02 E1/E2): [{ kind, label, item_count }].
async function closeBlockers(groupId, cycleId) {
  await cycleInGroup(groupId, cycleId);
  const { data, error } = await supabase.rpc('cycle_close_blockers', { p_cycle_id: cycleId });
  if (error) throw error;
  return data ?? [];
}

// Organizer only; close_cycle() refuses while anything blocks it (its
// message lists what) — surfaced as a 409.
async function closeCycle(groupId, cycleId, actorId) {
  await cycleInGroup(groupId, cycleId);
  const { data, error } = await supabase.rpc('close_cycle', { p_cycle_id: cycleId, p_actor_id: actorId });
  if (error) {
    if (error.code === 'P0001') throw Object.assign(new Error(error.message), { status: 409 });
    throw error;
  }
  return data;
}

// Everyone still in the group hears the cycle closed.
async function notifyCycleClosed(groupId, cycle) {
  const { data, error } = await supabase
    .from('memberships').select('member_id')
    .eq('group_id', groupId).in('status', ['active', 'suspended']);
  if (error) throw error;
  await Promise.all((data ?? []).map((m) => notify({
    memberId: m.member_id, groupId, type: 'cycle.closed', title: `${cycle.name} is closed`,
    message: 'Its records are now read-only. You can still view your contributions and payouts.',
  })));
}

async function cycleProgress(cycleId) {
  const { data, error } = await supabase.rpc('cycle_progress', { p_cycle_id: cycleId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

module.exports = { createCycle, listCycles, activateCycle, closeCycle, closeBlockers, notifyCycleClosed, cycleProgress };