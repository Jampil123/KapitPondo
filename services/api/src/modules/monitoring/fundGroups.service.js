/**
 * services/api/src/modules/monitoring/fundGroups.service.js
 * Fund Group Management for the System Administrator: one group's read-only
 * detail page, and platform-level suspension (migration 0065).
 *
 * What the administrator can do here is deliberately narrow. They observe a
 * group (organizer, officers, members, cycles, activity, reports) and may
 * suspend it for a documented policy violation. They never approve
 * contributions or loans, verify repayments, edit the ledger, change cycle
 * or loan terms, or create transactions on the group's behalf — nothing in
 * this file writes to those tables, and middleware/requireGroupRole.js stops
 * an admin account from doing it through the group routes either.
 */
const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { isMissingColumn } = require('../../lib/groupSuspension');

const OFFICER_ROLES = ['owner', 'treasurer', 'auditor'];
const OPEN_REPORT_STATUSES = ['new', 'under_review', 'investigating'];

// Adds suspension and open-report counts to the monitoring rows. Kept out of
// fund_groups_monitoring() so the list still loads before migration 0065.
async function withSuspensionAndReports(rows) {
  const [groupsRes, reportsRes, closedRes] = await Promise.all([
    supabase.from('groups').select('id, suspended_at, suspension_reason').not('suspended_at', 'is', null),
    supabase.from('problem_reports').select('group_id').not('group_id', 'is', null).in('status', OPEN_REPORT_STATUSES),
    supabase.from('cycles').select('group_id').eq('status', 'closed'),
  ]);
  if (closedRes.error) throw closedRes.error;
  const hasClosedCycle = new Set(closedRes.data.map((c) => c.group_id));
  if (groupsRes.error && !isMissingColumn(groupsRes.error)) throw groupsRes.error;
  // problem_reports is migration 0056 — treat it as optional the same way.
  const reports = reportsRes.error ? [] : reportsRes.data;

  const suspended = new Map((groupsRes.error ? [] : groupsRes.data).map((g) => [g.id, g]));
  const openReports = new Map();
  for (const r of reports) openReports.set(r.group_id, (openReports.get(r.group_id) ?? 0) + 1);

  return rows.map((g) => ({
    ...g,
    suspended_at: suspended.get(g.group_id)?.suspended_at ?? null,
    suspension_reason: suspended.get(g.group_id)?.suspension_reason ?? null,
    open_report_count: openReports.get(g.group_id) ?? 0,
    // Finished its fund cycle and hasn't started another (the Dashboard's "Closed").
    is_closed: g.group_status === 'active' && !g.active_cycle_id && hasClosedCycle.has(g.group_id),
  }));
}

async function fundGroupDetail(groupId, summaryRow) {
  const [groupRes, membershipsRes, cyclesRes, activityRes, reportsRes] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
    supabase
      .from('memberships')
      .select('id, role, status, joined_at, created_at, member:members!member_id(id, full_name, phone, email)')
      .eq('group_id', groupId),
    supabase.from('cycles').select('*').eq('group_id', groupId).order('start_date', { ascending: false }),
    supabase
      .from('audit_log')
      .select('id, action, entity_type, actor_role, created_at, actor:members!actor_id(full_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('problem_reports')
      .select('id, category, subject, status, resolution, created_at, reporter:members!reporter_id(full_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
  ]);
  for (const r of [groupRes, membershipsRes, cyclesRes, activityRes]) {
    if (r.error) throw r.error;
  }
  const group = groupRes.data;
  if (!group) return null;

  const memberships = membershipsRes.data;
  const byStatus = {};
  for (const m of memberships) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;

  const officers = memberships
    .filter((m) => m.status === 'active' && OFFICER_ROLES.includes(m.role))
    .sort((a, b) => OFFICER_ROLES.indexOf(a.role) - OFFICER_ROLES.indexOf(b.role))
    .map((m) => ({
      membership_id: m.id,
      role: m.role,
      member_id: m.member?.id ?? null,
      full_name: m.member?.full_name ?? null,
      phone: m.member?.phone ?? null,
      email: m.member?.email ?? null,
      since: m.joined_at ?? m.created_at,
    }));

  let suspendedByName = null;
  if (group.suspended_by) {
    const { data } = await supabase.from('members').select('full_name').eq('id', group.suspended_by).maybeSingle();
    suspendedByName = data?.full_name ?? null;
  }

  return {
    group: {
      id: group.id,
      name: group.name,
      fund_code: group.fund_code,
      description: group.description,
      status: group.status,
      created_at: group.created_at,
      suspended_at: group.suspended_at ?? null,
      suspension_reason: group.suspension_reason ?? null,
      suspended_by_name: suspendedByName,
    },
    summary: summaryRow ?? null,
    member_counts: {
      active: byStatus.active ?? 0,
      pending: byStatus.pending ?? 0,
      suspended: byStatus.suspended ?? 0,
      exited: byStatus.exited ?? 0,
    },
    officers,
    cycles: cyclesRes.data,
    activity: activityRes.data.map((a) => ({
      id: a.id,
      action: a.action,
      entity_type: a.entity_type,
      actor_role: a.actor_role,
      actor_name: a.actor?.full_name ?? null,
      created_at: a.created_at,
    })),
    reports: reportsRes.error ? [] : reportsRes.data.map((r) => ({
      id: r.id,
      category: r.category,
      subject: r.subject,
      status: r.status,
      resolution: r.resolution,
      created_at: r.created_at,
      reporter_name: r.reporter?.full_name ?? null,
    })),
  };
}

async function writeAudit(actorAuthId, action, groupId, metadata) {
  await supabase.from('system_audit_log').insert({
    actor_id: actorAuthId,
    action,
    target_type: 'group',
    target_id: groupId,
    metadata,
  });
}

// Everyone currently in the group hears about a suspension / reinstatement.
async function notifyGroup(groupId, { type, title, message, vars }) {
  const { data } = await supabase
    .from('memberships')
    .select('member_id')
    .eq('group_id', groupId)
    .in('status', ['active', 'suspended']);
  await Promise.all((data ?? []).map((m) => notify({ memberId: m.member_id, groupId, type, title, message, vars })));
}

// Freezes the group: requireGroupRole refuses every change in it until
// reinstated. Balances, ledger and records are left exactly as they are.
async function suspendGroup({ groupId, adminMemberId, actorAuthId, reason }) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('groups')
    .update({ suspended_at: now, suspended_by: adminMemberId, suspension_reason: reason })
    .eq('id', groupId)
    .is('suspended_at', null)
    .select('id, name')
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await Promise.all([
      writeAudit(actorAuthId, 'group.suspended', groupId, { reason }),
      notifyGroup(groupId, {
        type: 'group.suspended',
        vars: { group: data.name, reason },
        title: 'Fund group suspended',
        message: `${data.name} has been suspended: ${reason}. You can still view its records.`,
      }),
    ]);
  }
  return data;
}

async function reinstateGroup({ groupId, actorAuthId }) {
  const { data: before } = await supabase.from('groups').select('suspension_reason').eq('id', groupId).maybeSingle();
  const { data, error } = await supabase
    .from('groups')
    .update({ suspended_at: null, suspended_by: null, suspension_reason: null })
    .eq('id', groupId)
    .not('suspended_at', 'is', null)
    .select('id, name')
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await Promise.all([
      writeAudit(actorAuthId, 'group.reinstated', groupId, { previous_reason: before?.suspension_reason ?? null }),
      notifyGroup(groupId, {
        type: 'group.reinstated',
        vars: { group: data.name },
        title: 'Fund group reinstated',
        message: `${data.name} has been reinstated. Group activity is back to normal.`,
      }),
    ]);
  }
  return data;
}

module.exports = { withSuspensionAndReports, fundGroupDetail, suspendGroup, reinstateGroup };
