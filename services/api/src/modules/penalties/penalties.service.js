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
 * detection runs lazily: any officer viewing contributions triggers a check
 * first (see contributions.routes.js's GET list handler, via
 * checkLatePenaltiesIfDue below) — from the officer's point of view this is
 * automatic; nothing needs to be clicked to make it happen.
 *
 * checkLatePenaltiesIfDue() throttles that automatic trigger (see below) —
 * the contributions list it's called from is realtime-watched by the same
 * screen (useContributions), so an unthrottled check writing a new 'late'
 * row on every GET would fire a postgres_changes event back to that same
 * screen, triggering an immediate refetch of the page an officer just
 * opened (looks like "the page keeps reloading," reported and diagnosed as
 * this exact cause — not a network issue).
 */
const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

// A cycle's penalty is either a fixed peso amount or a percent of the
// contribution that was due (cycles.penalty_type).
function penaltyFor(cycle, contributionAmount) {
  const rate = Number(cycle.penalty_amount ?? 0);
  if (!rate) return 0;
  return cycle.penalty_type === 'percent'
    ? Math.round(Number(contributionAmount) * rate) / 100
    : rate;
}

function peso(n) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
//
// Also excludes cycles outside their own [start_date, end_date] window —
// createCycle() marks a brand-new cycle 'active' immediately even when its
// start_date is in the future (TC-011), and currentPeriodDueDate() below
// only knows "today's calendar month + contribution_due_day," with no idea
// what cycle it's being asked about. Without this guard, a cycle scheduled
// to start next month gets checked against THIS month's due day and flagged
// late for a period that doesn't exist yet. Same idea for end_date: nothing
// in this stack auto-closes a cycle once it ends (no cron), so a status
// still reading 'active' past end_date shouldn't be checked either.
async function checkLatePenalties(groupId) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: cycles, error: cyclesErr } = await supabase
    .from('cycles')
    .select('id, contribution_amount, penalty_amount, penalty_type, contribution_due_day, start_date, end_date')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .not('contribution_due_day', 'is', null)
    .lte('start_date', todayStr)
    .or(`end_date.is.null,end_date.gte.${todayStr}`);
  if (cyclesErr) throw cyclesErr;
  if (!cycles?.length) return [];

  const now = new Date();
  const { start, end } = monthRange(now);
  const created = [];

  for (const cycle of cycles) {
    // Belt-and-suspenders — the query above already filters this, but this
    // is the exact spot the bug manifested, so the invariant is worth
    // stating here too in case the query filter is ever loosened later.
    if (cycle.start_date && now < new Date(cycle.start_date)) continue; // cycle hasn't started
    if (cycle.end_date && now > new Date(cycle.end_date)) continue; // cycle window closed

    const dueDate = currentPeriodDueDate(cycle.contribution_due_day);
    if (now < dueDate) continue; // not due yet this period
    // This month's due day can fall before the cycle's first day (a cycle
    // starting on the 20th with a due day of the 15th) — that period isn't
    // part of the cycle, so there's nothing to be late for.
    if (cycle.start_date && dueDate < new Date(cycle.start_date)) continue;
    const dueDay = dueDate.toISOString().slice(0, 10);

    const { data: memberships, error: mErr } = await supabase
      .from('memberships')
      .select('id, heads')
      .eq('group_id', groupId)
      .eq('status', 'active');
    if (mErr) throw mErr;

    for (const membership of memberships) {
      // limit(1) + length, not maybeSingle(): with two or more matches
      // maybeSingle() returns an error and null data, which read as "none"
      // and charged the same period again on every check.
      const { data: paid, error: paidErr } = await supabase
        .from('contributions')
        .select('id')
        .eq('membership_id', membership.id)
        .eq('cycle_id', cycle.id)
        .in('status', ['submitted', 'approved'])
        .gte('created_at', start)
        .lt('created_at', end)
        .limit(1);
      if (paidErr) throw paidErr;
      if (paid.length) continue; // compliant this period

      const { data: flagged, error: flaggedErr } = await supabase
        .from('contributions')
        .select('id')
        .eq('membership_id', membership.id)
        .eq('cycle_id', cycle.id)
        .eq('status', 'late')
        .eq('due_date', dueDay)
        .limit(1);
      if (flaggedErr) throw flaggedErr;
      if (flagged.length) continue; // already charged this period

      const dueAmount = Number(cycle.contribution_amount) * (membership.heads || 1);
      const penaltyAmount = penaltyFor(cycle, dueAmount);
      const { data: lateContribution, error: insErr } = await supabase
        .from('contributions')
        .insert({
          membership_id: membership.id,
          cycle_id: cycle.id,
          group_id: groupId,
          amount: dueAmount,
          due_date: dueDay,
          is_late: true,
          penalty_applied: penaltyAmount,
          status: 'late',
        })
        .select()
        .single();
      // Two checks running at once: the unique index on late periods
      // (migration 0069) lets only one insert through; the other stops here.
      if (insErr?.code === '23505') continue;
      if (insErr) throw insErr;

      const { data: penalty, error: penErr } = await supabase
        .from('penalties')
        .insert({
          group_id: groupId,
          membership_id: membership.id,
          cycle_id: cycle.id,
          contribution_id: lateContribution.id,
          amount: penaltyAmount,
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
        message: `Your contribution is overdue — a ${peso(penaltyAmount)} late penalty was added. Pay it together with the contribution.`,
      });

      created.push(penalty);
    }
  }

  return created;
}

// Throttles the AUTOMATIC trigger only (contributions.routes.js's GET list
// handler) — the explicit POST /penalties/check endpoint always calls the
// raw checkLatePenalties() above, since that's a deliberate "run it now"
// action, not a side effect of viewing a list. Cooldown is only recorded on
// SUCCESS — if the check throws (e.g. a real network error), the next
// request tries again immediately rather than being locked out for the
// full window over something that never actually ran.
const AUTO_CHECK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastAutoCheckedAt = new Map(); // groupId -> timestamp

async function checkLatePenaltiesIfDue(groupId) {
  const last = lastAutoCheckedAt.get(groupId);
  const now = Date.now();
  if (last && now - last < AUTO_CHECK_COOLDOWN_MS) return [];
  const created = await checkLatePenalties(groupId);
  lastAutoCheckedAt.set(groupId, now);
  return created;
}

async function listPenalties({ groupId, status, membershipId }) {
  let q = supabase
    .from('penalties')
    .select('*, membership:memberships!membership_id(member_id, members!member_id(full_name, avatar_url))')
    .eq('group_id', groupId);
  if (status) q = q.eq('status', status);
  if (membershipId) q = q.eq('membership_id', membershipId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// A member's self-submitted contribution covers their pending late penalties
// for that cycle when the amount paid is at least the contribution due plus
// those penalties. The contribution itself keeps only the contribution share
// (capital); the rest is recorded as penalty_applied, and the covered
// penalties are settled when the contribution is approved (see
// settlePenaltiesFor). A penalty already riding on another contribution
// that's still under review isn't counted twice; one whose contribution was
// rejected is free to be covered again.
async function splitPenaltyShare({ groupId, membershipId, heads, cycleId, amount }) {
  await checkLatePenaltiesIfDue(groupId).catch((e) => console.error('[penalties] check failed:', e.message));

  const { data: cycle, error: cErr } = await supabase
    .from('cycles').select('contribution_amount').eq('id', cycleId).single();
  if (cErr) throw cErr;

  const { data: pending, error } = await supabase
    .from('penalties')
    .select('id, amount, paid_with:contributions!paid_with_contribution_id(status)')
    .eq('membership_id', membershipId)
    .eq('cycle_id', cycleId)
    .eq('status', 'pending');
  if (error) throw error;

  const coverable = (pending ?? []).filter((p) => !p.paid_with || p.paid_with.status === 'rejected');
  const penaltyShare = Math.round(coverable.reduce((sum, p) => sum + Number(p.amount), 0) * 100) / 100;
  const due = Number(cycle.contribution_amount) * (heads || 1);
  const paid = Number(amount);

  if (!penaltyShare || paid + 0.005 < due + penaltyShare) {
    return { contributionAmount: paid, penaltyShare: 0, penaltyIds: [] };
  }
  return {
    contributionAmount: Math.round((paid - penaltyShare) * 100) / 100,
    penaltyShare,
    penaltyIds: coverable.map((p) => p.id),
  };
}

async function coverPenalties({ penaltyIds, contributionId }) {
  if (!penaltyIds.length) return;
  const { error } = await supabase
    .from('penalties')
    .update({ paid_with_contribution_id: contributionId, updated_at: new Date().toISOString() })
    .in('id', penaltyIds)
    .eq('status', 'pending');
  if (error) throw error;
}

// Posts the penalties an approved contribution covered (migration 0068).
async function settlePenaltiesFor({ contributionId, approverId }) {
  const { data, error } = await supabase.rpc('settle_contribution_penalties', {
    p_contribution_id: contributionId,
    p_approver_id: approverId,
  });
  if (error) throw error;
  return data ?? [];
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

module.exports = {
  penaltyFor, splitPenaltyShare, coverPenalties, settlePenaltiesFor,
  checkLatePenalties, checkLatePenaltiesIfDue, listPenalties, waivePenalty,
};
