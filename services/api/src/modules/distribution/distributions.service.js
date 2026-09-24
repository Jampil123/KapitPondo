const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

async function previewDistribution({ groupId, period, declaredBy }) {
  const { data, error } = await supabase.rpc('preview_distribution', {
    p_group_id: groupId,
    p_period: period,
    p_declared_by: declaredBy,
  });
  if (error) throw error;
  return data;
}

// Auditor verifies a previewed distribution — proceeds to the Owner for
// final approval (TC-027). finalize_distribution (migration 0028) requires
// this status, not just 'previewed'.
async function verifyDistribution({ distributionId, verifiedBy, notes }) {
  const { data, error } = await supabase
    .from('distributions')
    .update({
      status: 'verified',
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verify_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', distributionId)
    .eq('status', 'previewed')
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listDistributions(groupId) {
  const { data, error } = await supabase
    .from('distributions')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getDistribution(id) {
  const { data, error } = await supabase
    .from('distributions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// `caller` scopes the result for a plain member to their OWN allocation only —
// without it, a member could see every other member's name + share, which
// breaks the "members may not see other members' individual figures" rule.
async function getAllocations(distributionId, caller = {}) {
  let q = supabase
    .from('distribution_allocations')
    .select('*, memberships!membership_id(member_id, heads, members!member_id(full_name, avatar_url))')
    .eq('distribution_id', distributionId)
    .order('created_at', { ascending: true });
  if (caller.role === 'member') q = q.eq('membership_id', caller.membershipId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Finalize: posts payouts, fund goes to 0. Requires status 'verified' (see
// migration 0028) — an Auditor must have signed off first (TC-015).
async function finalizeDistribution({ distributionId, finalizedBy }) {
  const { data, error } = await supabase.rpc('finalize_distribution', {
    p_distribution_id: distributionId,
    p_finalized_by: finalizedBy,
  });
  if (error) throw error;

  // TC-015: "all members are notified"
  const allocations = await getAllocations(distributionId);
  for (const alloc of allocations) {
    const memberId = alloc.memberships?.member_id;
    if (!memberId) continue;
    await notify({
      memberId,
      groupId: data.group_id,
      type: 'distribution.finalized',
      title: 'Year-end distribution finalized',
      message: `Your share of ${data.period}'s year-end distribution (${alloc.amount}) has been posted.`,
    });
  }

  return data;
}

// Cancel a previewed distribution (deletes it and its allocations) so it can be re-run
async function cancelPreview(distributionId) {
  // allocations are removed by ON DELETE CASCADE on distribution_id
  const { data, error } = await supabase
    .from('distributions')
    .delete()
    .eq('id', distributionId)
    .eq('status', 'previewed')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Advances `d` in place by one period, per the cycle's cadence — same
// stepping as apps/mobile's periods.ts stepPeriod().
function stepPeriod(d, frequency) {
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
}

// The nearest due date at or after `today` — the current period's, if it
// hasn't passed, otherwise the next one. Recurs every period for the life of
// the cycle — same logic as apps/mobile's periods.ts nearestDueDate().
function nearestDueDate(cycle, today) {
  if (cycle.frequency === 'monthly' && cycle.contribution_due_day) {
    const start = new Date(cycle.start_date);
    const candidate = new Date(start.getFullYear(), start.getMonth(), cycle.contribution_due_day);
    while (candidate < today) candidate.setMonth(candidate.getMonth() + 1);
    return candidate;
  }
  const candidate = new Date(cycle.start_date);
  while (candidate < today) stepPeriod(candidate, cycle.frequency);
  return candidate;
}

// Self-service: a member adjusts their own head count. Free to change before
// the active cycle's next due date is close — only locked in the week
// leading up to it, once the cycle has actually started (contributions get
// tracked against heads from then on). No active cycle yet, or one that
// hasn't started, means nothing to lock against, so it's freely editable.
async function setHeads({ groupId, membershipId, heads }) {
  const { data: cycle, error: cErr } = await supabase
    .from('cycles')
    .select('start_date, contribution_due_day, frequency')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .maybeSingle();
  if (cErr) throw cErr;

  if (cycle) {
    const now = new Date();
    // Date-only comparison — these are civil dates with no time-of-day
    // meaning, so "due today" must still count as in-window.
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const started = today >= new Date(cycle.start_date);
    if (started) {
      const due = nearestDueDate(cycle, today);
      const windowStart = new Date(due);
      windowStart.setDate(windowStart.getDate() - 7);
      if (today < windowStart || today > due) {
        throw Object.assign(
          new Error("Heads can only be changed in the week before a due date."),
          { status: 409 },
        );
      }
    }
  }

  // Each head is a loan slot (migration 0065) — a head can't be removed while
  // it still has a loan in progress.
  const { data: openLoans, error: lErr } = await supabase
    .from('loans')
    .select('head_no')
    .eq('membership_id', membershipId)
    .in('status', ['pending', 'approved', 'active']);
  if (lErr) throw lErr;
  const highestOpenHead = Math.max(0, ...(openLoans ?? []).map((l) => l.head_no));
  if (Number(heads) < highestOpenHead) {
    throw Object.assign(
      new Error(`Head ${highestOpenHead} still has a loan in progress. Settle it before lowering your heads.`),
      { status: 409 },
    );
  }

  const { data: before } = await supabase
    .from('memberships').select('heads').eq('id', membershipId).maybeSingle();

  const { data, error } = await supabase
    .from('memberships')
    .update({ heads })
    .eq('id', membershipId)
    .select()
    .single();
  if (error) throw error;

  // Names for heads that no longer exist would resurface if heads went back up.
  await supabase.from('membership_head_names').delete().eq('membership_id', membershipId).gt('head_no', Number(heads));

  return { membership: data, previousHeads: before?.heads ?? null };
}

async function getHeadNames({ groupId, membershipId }) {
  const { data: membership, error: mErr } = await supabase
    .from('memberships').select('id').eq('id', membershipId).eq('group_id', groupId).maybeSingle();
  if (mErr) throw mErr;
  if (!membership) throw Object.assign(new Error('Membership not found in this group'), { status: 404 });
  const { data, error } = await supabase
    .from('membership_head_names').select('head_no, name').eq('membership_id', membershipId).order('head_no');
  if (error) throw error;
  return data;
}

// Names for heads 2..heads (head 1 is the member themselves). Blank clears.
async function setHeadNames({ membershipId, names }) {
  const { data: membership, error: mErr } = await supabase
    .from('memberships').select('heads').eq('id', membershipId).single();
  if (mErr) throw mErr;

  const upserts = [];
  const clears = [];
  for (const [key, raw] of Object.entries(names)) {
    const headNo = Number(key);
    if (!Number.isInteger(headNo) || headNo < 2 || headNo > membership.heads) {
      throw Object.assign(new Error(`Head ${key} doesn't exist — you have ${membership.heads} head${membership.heads === 1 ? '' : 's'}`), { status: 400 });
    }
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name.length > 80) throw Object.assign(new Error('Names can be at most 80 characters'), { status: 400 });
    if (name) upserts.push({ membership_id: membershipId, head_no: headNo, name, updated_at: new Date().toISOString() });
    else clears.push(headNo);
  }

  if (upserts.length) {
    const { error } = await supabase.from('membership_head_names').upsert(upserts, { onConflict: 'membership_id,head_no' });
    if (error) throw error;
  }
  if (clears.length) {
    const { error } = await supabase.from('membership_head_names').delete().eq('membership_id', membershipId).in('head_no', clears);
    if (error) throw error;
  }

  const { data, error } = await supabase
    .from('membership_head_names').select('head_no, name').eq('membership_id', membershipId).order('head_no');
  if (error) throw error;
  return data;
}

module.exports = {
  getHeadNames,
  setHeadNames,
  previewDistribution,
  verifyDistribution,
  listDistributions,
  getDistribution,
  getAllocations,
  finalizeDistribution,
  cancelPreview,
  setHeads,
};