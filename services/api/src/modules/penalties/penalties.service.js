/**
 * services/api/src/modules/penalties/penalties.service.js
 * TC-039: detects a missed contribution once its due day has passed and
 * charges a penalty; TC-017: lets the Owner waive it.
 *
 * Penalties are tracked in their own table as pending/waived/paid — never
 * posted to the ledger while pending, so an unpaid penalty can't distort
 * `group_available_cash` (that's real cash only). A companion `contributions`
 * row (status: 'late') exists purely so the missed period shows up in the
 * member's own contribution history instead of just silence.
 *
 * There's no task scheduler in this stack (no cron/pg_cron wired up), so
 * detection runs lazily: any officer viewing contributions or cycle progress
 * for a group triggers a check first (see contributions.routes.js /
 * cycles.routes.js) — from the officer's point of view this is automatic;
 * nothing needs to be clicked to make it happen.
 */
const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

function currentPeriodDueDate(dueDay) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dueDay));
}

function monthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// Checks every active cycle in the group with a contribution_due_day set;
// for each active membership with no submitted/approved contribution for the
// current period past that due day, charges a penalty (idempotent — running
// this again the same period is a no-op for members already flagged).
async function checkLatePenalties(groupId) {
  const { data: cycles, error: cyclesErr } = await supabase
    .from('cycles')
    .select('id, contribution_amount, penalty_amount, contribution_due_day')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .not('contribution_due_day', 'is', null);
  if (cyclesErr) throw cyclesErr;
  if (!cycles?.length) return [];

  const now = new Date();
  const { start, end } = monthRange(now);
  const created = [];

  for (const cycle of cycles) {
    const dueDate = currentPeriodDueDate(cycle.contribution_due_day);
    if (now < dueDate) continue; // not due yet this period

    const { data: memberships, error: mErr } = await supabase
      .from('memberships')
      .select('id, heads')
      .eq('group_id', groupId)
      .eq('status', 'active');
    if (mErr) throw mErr;

    for (const membership of memberships) {
      const { data: paid } = await supabase
        .from('contributions')
        .select('id')
        .eq('membership_id', membership.id)
        .eq('cycle_id', cycle.id)
        .in('status', ['submitted', 'approved'])
        .gte('created_at', start)
        .lt('created_at', end)
        .maybeSingle();
      if (paid) continue; // compliant this period

      const { data: alreadyFlagged } = await supabase
        .from('contributions')
        .select('id')
        .eq('membership_id', membership.id)
        .eq('cycle_id', cycle.id)
        .eq('status', 'late')
        .eq('due_date', dueDate.toISOString().slice(0, 10))
        .maybeSingle();
      if (alreadyFlagged) continue; // already charged this period

      const { data: lateContribution, error: insErr } = await supabase
        .from('contributions')
        .insert({
          membership_id: membership.id,
          cycle_id: cycle.id,
          group_id: groupId,
          amount: Number(cycle.contribution_amount) * (membership.heads || 1),
          due_date: dueDate.toISOString().slice(0, 10),
          is_late: true,
          penalty_applied: cycle.penalty_amount,
          status: 'late',
        })
        .select()
        .single();
      if (insErr) throw insErr;

      const { data: penalty, error: penErr } = await supabase
        .from('penalties')
        .insert({
          group_id: groupId,
          membership_id: membership.id,
          cycle_id: cycle.id,
          contribution_id: lateContribution.id,
          amount: cycle.penalty_amount,
          reason: 'Late contribution',
        })
        .select()
        .single();
      if (penErr) throw penErr;

      const { data: memberRow } = await supabase
        .from('memberships').select('member_id').eq('id', membership.id).single();
      await notify({
        memberId: memberRow.member_id,
        groupId,
        type: 'penalty.charged',
        title: 'Late penalty applied',
        message: `Your contribution is overdue — a ${cycle.penalty_amount} penalty has been applied.`,
      });

      created.push(penalty);
    }
  }

  return created;
}

async function listPenalties({ groupId, status }) {
  let q = supabase
    .from('penalties')
    .select('*, membership:memberships!membership_id(member_id, members!member_id(full_name))')
    .eq('group_id', groupId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function waivePenalty({ penaltyId, waivedBy, reason }) {
  const { data, error } = await supabase
    .from('penalties')
    .update({
      status: 'waived',
      waived_by: waivedBy,
      waived_at: new Date().toISOString(),
      waive_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', penaltyId)
    .eq('status', 'pending')
    .select()
    .single();
  if (error) throw error;

  if (data) {
    const { data: membership } = await supabase
      .from('memberships').select('member_id, group_id').eq('id', data.membership_id).maybeSingle();
    if (membership) {
      await notify({
        memberId: membership.member_id,
        groupId: membership.group_id,
        type: 'penalty.waived',
        title: 'Penalty waived',
        message: reason ? `Your late penalty was waived: ${reason}` : 'Your late penalty was waived.',
      });
    }
  }

  return data;
}

module.exports = { checkLatePenalties, listPenalties, waivePenalty };
