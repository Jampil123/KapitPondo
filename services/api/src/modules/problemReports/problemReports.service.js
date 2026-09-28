/**
 * services/api/src/modules/problemReports/problemReports.service.js
 * Reports of Problems / Complaints (migration 0056).
 *
 * Members file problems; the System Administrator works each one through
 * new → under_review → investigating → resolved → closed, and every step is
 * appended to problem_report_events.
 *
 * Boundary that this module enforces by simply not offering the operation:
 * nothing here edits contributions, loans, or the ledger. A complaint that
 * needs a financial correction is closed with resolution
 * 'referred_to_group' — the fund group's officers make the correction through
 * their own authorized workflow.
 */
const supabase = require('../../config/supabase');
const { notify, notifyAdmins } = require('../../lib/notifications');

const CATEGORIES = [
  { key: 'account_information', label: 'Incorrect account information' },
  { key: 'identity_verification', label: 'Identity verification problem' },
  { key: 'technical', label: 'Technical problem' },
  { key: 'group_activity', label: 'Inappropriate group activity' },
  { key: 'account_concern', label: 'Account-related concern' },
  { key: 'other', label: 'Other' },
];

// The workflow, in order. Each step may also be closed outright.
const STATUSES = ['new', 'under_review', 'investigating', 'resolved', 'closed'];
const RESOLUTIONS = ['resolved', 'referred_to_group', 'no_action', 'duplicate'];

// What the admin console may move a report to from where it is now.
const NEXT_STATUS = {
  new: ['under_review', 'closed'],
  under_review: ['investigating', 'resolved', 'closed'],
  investigating: ['resolved', 'closed'],
  resolved: ['closed', 'investigating'],
  closed: [],
};

// PostgREST codes for "the table isn't there" — migration 0056 not applied.
const MISSING_TABLE = new Set(['PGRST205', '42P01']);
function isMissingTable(error) {
  return !!error && (MISSING_TABLE.has(error.code) || /problem_reports/.test(error.message ?? '') && /does not exist|schema cache/i.test(error.message));
}

const SELECT = `
  id, category, subject, description, status, resolution, resolution_note,
  reporter_id, group_id, handled_by, created_at, updated_at, resolved_at, closed_at,
  reporter:reporter_id(full_name, email),
  group:group_id(name, fund_code),
  handler:handled_by(full_name, email)
`;

function shape(r) {
  return {
    ...r,
    reporter_name: r.reporter?.full_name ?? r.reporter?.email ?? null,
    group_name: r.group?.name ?? null,
    fund_code: r.group?.fund_code ?? null,
    handled_by_name: r.handler?.full_name ?? r.handler?.email ?? null,
  };
}

// --- admin side ------------------------------------------------------------

async function listReports({ status, category, group_id, member_id, from, to } = {}) {
  let q = supabase.from('problem_reports').select(SELECT).order('created_at', { ascending: false }).limit(1000);
  if (status) q = q.eq('status', status);
  if (category) q = q.eq('category', category);
  if (group_id) q = q.eq('group_id', group_id);
  if (member_id) q = q.eq('reporter_id', member_id);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to);

  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return { available: false, reports: [], counts: {} };
    throw error;
  }

  const reports = data.map(shape);
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: reports.filter((r) => r.status === s).length }), {});
  return { available: true, reports, counts: { all: reports.length, ...counts } };
}

async function getReport(id) {
  const { data, error } = await supabase.from('problem_reports').select(SELECT).eq('id', id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data) return null;

  const { data: events, error: evErr } = await supabase
    .from('problem_report_events')
    .select('id, from_status, to_status, note, created_at, actor:actor_id(full_name, email)')
    .eq('report_id', id)
    .order('created_at', { ascending: true });
  if (evErr) throw evErr;

  return {
    ...shape(data),
    events: (events ?? []).map((e) => ({
      ...e,
      actor_name: e.actor?.full_name ?? e.actor?.email ?? null,
    })),
  };
}

/**
 * Advance one report. `adminMemberId` is members.id of the acting admin.
 * Returns { error } for a rejected transition so the route can 400 it.
 */
async function updateStatus({ id, status, note, resolution, resolutionNote, adminMemberId }) {
  if (!STATUSES.includes(status)) return { error: `Unknown status "${status}"` };
  if (resolution && !RESOLUTIONS.includes(resolution)) return { error: `Unknown resolution "${resolution}"` };

  const current = await getReport(id);
  if (!current) return { error: 'Report not found', notFound: true };
  if (current.status === status) return { error: `Report is already ${status}` };
  if (!NEXT_STATUS[current.status].includes(status)) {
    return { error: `Cannot move a ${current.status.replace('_', ' ')} report to ${status.replace('_', ' ')}` };
  }
  if (status === 'resolved' && !resolution) {
    return { error: 'A resolution is required when resolving a report' };
  }

  const now = new Date().toISOString();
  const patch = { status, updated_at: now, handled_by: adminMemberId };
  if (resolution) patch.resolution = resolution;
  if (resolutionNote !== undefined && resolutionNote !== null) patch.resolution_note = resolutionNote;
  if (status === 'resolved') patch.resolved_at = now;
  if (status === 'closed') patch.closed_at = now;

  const { error } = await supabase.from('problem_reports').update(patch).eq('id', id);
  if (error) throw error;

  await supabase.from('problem_report_events').insert({
    report_id: id,
    actor_id: adminMemberId,
    from_status: current.status,
    to_status: status,
    note: note ?? null,
  });

  // Keep the member who raised it in the loop (fire-and-forget, as elsewhere).
  if (current.reporter_id && (status === 'resolved' || status === 'closed' || status === 'under_review')) {
    const message = status === 'under_review'
      ? `Your report "${current.subject}" is being reviewed.`
      : resolution === 'referred_to_group'
        ? `Your report "${current.subject}" was referred to your fund group's officers, who handle financial corrections.`
        : `Your report "${current.subject}" is now ${status}.`;
    await notify({
      memberId: current.reporter_id,
      groupId: current.group_id ?? null,
      type: `problem_report.${status}`,
      title: 'Update on your report',
      message,
    });
  }

  return { report: await getReport(id) };
}

// --- member side -----------------------------------------------------------

async function fileReport({ memberId, category, subject, description, groupId }) {
  if (!CATEGORIES.some((c) => c.key === category)) return { error: `Unknown category "${category}"` };
  if (!subject || !description) return { error: 'subject and description are required' };

  const { data, error } = await supabase.from('problem_reports')
    .insert({
      reporter_id: memberId,
      group_id: groupId ?? null,
      category,
      subject,
      description,
    })
    .select(SELECT)
    .single();
  if (error) {
    if (isMissingTable(error)) return { error: 'Problem reporting is not available yet', unavailable: true };
    throw error;
  }

  await supabase.from('problem_report_events').insert({
    report_id: data.id, actor_id: memberId, from_status: null, to_status: 'new', note: 'Report filed',
  });

  await notifyAdmins({
    type: 'problem_report.filed',
    title: 'New problem report',
    message: `${CATEGORIES.find((c) => c.key === category).label}: ${subject}`,
  });

  return { report: shape(data) };
}

async function listMyReports(memberId) {
  const { data, error } = await supabase.from('problem_reports').select(SELECT)
    .eq('reporter_id', memberId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data.map(shape);
}

module.exports = {
  CATEGORIES, STATUSES, RESOLUTIONS, NEXT_STATUS,
  listReports, getReport, updateStatus, fileReport, listMyReports,
};
