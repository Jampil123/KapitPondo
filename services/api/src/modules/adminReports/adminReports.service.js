/**
 * services/api/src/modules/adminReports/adminReports.service.js
 * Reports & Analytics for the System Administrator — system-wide, read-only.
 *
 * One report registry: each entry declares its columns, the filters it
 * supports, and a run() that returns rows. The admin console renders whatever
 * shape comes back, so adding a report here needs no frontend change.
 *
 * Everything is computed from the tables (no new SQL functions), so this works
 * against the current database without a migration.
 *
 * Filters (a report opts into the ones that make sense for it):
 *   from / to  — date range over that report's own date field
 *   status     — verification status, group status, or membership status
 *   group_id   — one fund group
 *   member_id  — one user
 *   action     — one audit action
 */
const supabase = require('../../config/supabase');
const monitoring = require('../monitoring/monitoring.service');

const MAX_ROWS = 5000; // generous, but keeps one bad filter from dumping the DB

// --- helpers ---------------------------------------------------------------

function endOfDay(date) {
  // `to` arrives as a plain date (2026-09-21) — include the whole day.
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T23:59:59.999Z` : date;
}

// Applies the date range to whichever column this report dates its rows by.
function applyDateRange(q, field, { from, to }) {
  if (from) q = q.gte(field, from);
  if (to) q = q.lte(field, endOfDay(to));
  return q;
}

function inRange(value, { from, to }) {
  if (!value) return !from && !to;
  const t = new Date(value).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(endOfDay(to)).getTime()) return false;
  return true;
}

async function fetchAll(query) {
  const { data, error } = await query.limit(MAX_ROWS);
  if (error) throw error;
  return data ?? [];
}

// member id -> display name, for audit rows that only carry ids.
async function memberNames() {
  const rows = await fetchAll(supabase.from('members').select('id, full_name, email, auth_id'));
  const byId = new Map();
  const byAuthId = new Map();
  for (const m of rows) {
    const name = m.full_name || m.email || m.id;
    byId.set(m.id, name);
    if (m.auth_id) byAuthId.set(m.auth_id, name);
  }
  return { byId, byAuthId };
}

async function groupNames() {
  const rows = await fetchAll(supabase.from('groups').select('id, name'));
  return new Map(rows.map((g) => [g.id, g.name]));
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Number.isNaN(diff) ? null : Math.round((diff / 86400000) * 10) / 10;
}

function countBy(rows, key) {
  return rows.reduce((acc, r) => {
    const k = r[key] ?? 'unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

function sumBy(rows, key) {
  return rows.reduce((total, r) => total + (Number(r[key]) || 0), 0);
}

// --- reports ---------------------------------------------------------------

const REPORTS = {
  // ---- User Reports ----
  'user-registrations': {
    category: 'User Reports',
    label: 'User Registration Report',
    description: 'Accounts created on the platform, newest first.',
    dateLabel: 'Registered',
    filters: ['date', 'status', 'user', 'group'],
    statusOptions: 'verification',
    columns: [
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'location', label: 'Location' },
      { key: 'verification_status', label: 'Status', type: 'status' },
      { key: 'created_at', label: 'Registered', type: 'datetime' },
    ],
    async run(f) {
      let q = supabase.from('members')
        .select('id, full_name, email, phone, city, province, verification_status, created_at')
        .order('created_at', { ascending: false });
      q = applyDateRange(q, 'created_at', f);
      if (f.status) q = q.eq('verification_status', f.status);
      if (f.member_id) q = q.eq('id', f.member_id);
      if (f.group_id) {
        const ids = await fetchAll(supabase.from('memberships').select('member_id').eq('group_id', f.group_id));
        q = q.in('id', ids.map((m) => m.member_id));
      }
      const rows = (await fetchAll(q)).map((m) => ({
        ...m,
        location: [m.city, m.province].filter(Boolean).join(', ') || null,
      }));
      return { rows, summary: { Total: rows.length, ...countBy(rows, 'verification_status') } };
    },
  },

  'account-verifications': {
    category: 'User Reports',
    label: 'Account Verification Report',
    description: 'Every ID submission and how it was decided, with review turnaround.',
    dateLabel: 'Submitted',
    filters: ['date', 'status', 'user'],
    statusOptions: 'verification',
    columns: [
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'id_type', label: 'ID type' },
      { key: 'submitted_at', label: 'Submitted', type: 'datetime' },
      { key: 'verification_status', label: 'Status', type: 'status' },
      { key: 'verified_at', label: 'Decided', type: 'datetime' },
      { key: 'turnaround_days', label: 'Days to decide', type: 'number' },
      { key: 'verified_by_name', label: 'Reviewed by' },
      { key: 'verification_rejection_reason', label: 'Rejection reason' },
    ],
    async run(f) {
      let q = supabase.from('members')
        .select('id, full_name, email, id_type, submitted_at, verified_at, verified_by, verification_status, verification_rejection_reason')
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false });
      q = applyDateRange(q, 'submitted_at', f);
      if (f.status) q = q.eq('verification_status', f.status);
      if (f.member_id) q = q.eq('id', f.member_id);

      const [rows, names] = await Promise.all([fetchAll(q), memberNames()]);
      const out = rows.map((m) => ({
        ...m,
        verified_by_name: m.verified_by ? names.byId.get(m.verified_by) ?? null : null,
        turnaround_days: daysBetween(m.submitted_at, m.verified_at),
      }));
      const decided = out.filter((r) => r.turnaround_days !== null);
      return {
        rows: out,
        summary: {
          Submissions: out.length,
          ...countBy(out, 'verification_status'),
          'Avg days to decide': decided.length
            ? Math.round((sumBy(decided, 'turnaround_days') / decided.length) * 10) / 10
            : '—',
        },
      };
    },
  },

  'account-status': {
    category: 'User Reports',
    label: 'Account Status Report',
    description: 'Current verification standing of every account, with group membership.',
    dateLabel: 'Registered',
    filters: ['date', 'status', 'user', 'group'],
    statusOptions: 'verification',
    columns: [
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'verification_status', label: 'Status', type: 'status' },
      { key: 'verified_at', label: 'Verified on', type: 'datetime' },
      { key: 'group_count', label: 'Groups', type: 'number' },
      { key: 'created_at', label: 'Registered', type: 'datetime' },
    ],
    async run(f) {
      let q = supabase.from('members')
        .select('id, full_name, email, phone, verification_status, verified_at, created_at')
        .order('full_name', { ascending: true });
      q = applyDateRange(q, 'created_at', f);
      if (f.status) q = q.eq('verification_status', f.status);
      if (f.member_id) q = q.eq('id', f.member_id);

      let memberships = supabase.from('memberships').select('member_id, group_id').eq('status', 'active');
      if (f.group_id) memberships = memberships.eq('group_id', f.group_id);

      const [rows, mships] = await Promise.all([fetchAll(q), fetchAll(memberships)]);
      const counts = mships.reduce((acc, m) => acc.set(m.member_id, (acc.get(m.member_id) ?? 0) + 1), new Map());
      let out = rows.map((m) => ({ ...m, group_count: counts.get(m.id) ?? 0 }));
      if (f.group_id) out = out.filter((m) => counts.has(m.id)); // only members of that group
      return { rows: out, summary: { Accounts: out.length, ...countBy(out, 'verification_status') } };
    },
  },

  // ---- Fund Group Reports ----
  'fund-group-summary': {
    category: 'Fund Group Reports',
    label: 'Fund Group Summary',
    description: 'Members, contributions, outstanding loans and balance per fund group.',
    dateLabel: 'Created',
    filters: ['date', 'status', 'group'],
    statusOptions: 'group',
    columns: [
      { key: 'group_name', label: 'Fund Group' },
      { key: 'fund_code', label: 'Fund Code' },
      { key: 'organizer_name', label: 'Organizer' },
      { key: 'member_count', label: 'Members', type: 'number' },
      { key: 'active_cycle_name', label: 'Active Cycle' },
      { key: 'total_contributions', label: 'Total Contributions', type: 'money' },
      { key: 'outstanding_loans', label: 'Outstanding Loans', type: 'money' },
      { key: 'fund_balance', label: 'Fund Balance', type: 'money' },
      { key: 'group_status', label: 'Status', type: 'status' },
      { key: 'created_at', label: 'Created', type: 'date' },
      { key: 'last_activity_at', label: 'Last Activity', type: 'datetime' },
    ],
    async run(f) {
      // Same source as Fund Group Monitoring, so the numbers always agree.
      const all = await monitoring.fundGroupsMonitoring();
      const rows = all.filter((g) =>
        (!f.status || g.group_status === f.status) &&
        (!f.group_id || g.group_id === f.group_id) &&
        inRange(g.created_at, f));
      return {
        rows,
        summary: {
          'Fund groups': rows.length,
          Members: rows.reduce((s, g) => s + (g.member_count ?? 0), 0),
          Contributions: sumBy(rows, 'total_contributions'),
          'Outstanding loans': sumBy(rows, 'outstanding_loans'),
          'Fund balance': sumBy(rows, 'fund_balance'),
        },
      };
    },
  },

  'group-status': {
    category: 'Fund Group Reports',
    label: 'Active / Closed Group Report',
    description: 'Group standing with cycle history — active groups versus archived ones.',
    dateLabel: 'Created',
    filters: ['date', 'status', 'group'],
    statusOptions: 'group',
    columns: [
      { key: 'group_name', label: 'Fund Group' },
      { key: 'fund_code', label: 'Fund Code' },
      { key: 'group_status', label: 'Group Status', type: 'status' },
      { key: 'member_count', label: 'Members', type: 'number' },
      { key: 'active_cycles', label: 'Active Cycles', type: 'number' },
      { key: 'closed_cycles', label: 'Closed Cycles', type: 'number' },
      { key: 'draft_cycles', label: 'Draft Cycles', type: 'number' },
      { key: 'fund_balance', label: 'Fund Balance', type: 'money' },
      { key: 'created_at', label: 'Created', type: 'date' },
      { key: 'last_activity_at', label: 'Last Activity', type: 'datetime' },
    ],
    async run(f) {
      const [all, cycles] = await Promise.all([
        monitoring.fundGroupsMonitoring(),
        fetchAll(supabase.from('cycles').select('group_id, status')),
      ]);
      const byGroup = new Map();
      for (const c of cycles) {
        const e = byGroup.get(c.group_id) ?? { active: 0, closed: 0, draft: 0 };
        if (c.status === 'active') e.active += 1;
        else if (c.status === 'closed') e.closed += 1;
        else e.draft += 1;
        byGroup.set(c.group_id, e);
      }
      const rows = all
        .filter((g) =>
          (!f.status || g.group_status === f.status) &&
          (!f.group_id || g.group_id === f.group_id) &&
          inRange(g.created_at, f))
        .map((g) => {
          const c = byGroup.get(g.group_id) ?? { active: 0, closed: 0, draft: 0 };
          return {
            ...g,
            active_cycles: c.active,
            closed_cycles: c.closed,
            draft_cycles: c.draft,
          };
        });
      return {
        rows,
        summary: {
          'Fund groups': rows.length,
          Active: rows.filter((g) => g.group_status === 'active').length,
          Archived: rows.filter((g) => g.group_status === 'archived').length,
          'Closed cycles': sumBy(rows, 'closed_cycles'),
        },
      };
    },
  },

  'membership-summary': {
    category: 'Fund Group Reports',
    label: 'Membership Summary',
    description: 'Every membership across all groups, with role and standing.',
    dateLabel: 'Joined',
    filters: ['date', 'status', 'group', 'user'],
    statusOptions: 'membership',
    columns: [
      { key: 'group_name', label: 'Fund Group' },
      { key: 'member_name', label: 'Member' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'joined_at', label: 'Joined', type: 'date' },
      { key: 'created_at', label: 'Requested', type: 'datetime' },
    ],
    async run(f) {
      let q = supabase.from('memberships')
        .select('id, role, status, joined_at, created_at, group_id, member_id, groups:group_id(name), members:member_id(full_name, email)')
        .order('created_at', { ascending: false });
      q = applyDateRange(q, 'created_at', f);
      if (f.status) q = q.eq('status', f.status);
      if (f.group_id) q = q.eq('group_id', f.group_id);
      if (f.member_id) q = q.eq('member_id', f.member_id);

      const rows = (await fetchAll(q)).map((m) => ({
        ...m,
        group_name: m.groups?.name ?? null,
        member_name: m.members?.full_name ?? null,
        email: m.members?.email ?? null,
      }));
      return {
        rows,
        summary: {
          Memberships: rows.length,
          ...countBy(rows, 'status'),
          Officers: rows.filter((r) => r.role !== 'member').length,
        },
      };
    },
  },

  // ---- System Activity ----
  'system-activity': {
    category: 'System Activity',
    label: 'System Activity Report',
    description: 'In-group activity trail — who did what, in which fund group.',
    dateLabel: 'When',
    filters: ['date', 'group', 'user', 'action'],
    actionSource: 'group',
    columns: [
      { key: 'created_at', label: 'When', type: 'datetime' },
      { key: 'group_name', label: 'Fund Group' },
      { key: 'actor_name', label: 'Actor' },
      { key: 'action', label: 'Action' },
      { key: 'entity_type', label: 'Entity' },
      { key: 'entity_id', label: 'Entity ID' },
    ],
    async run(f) {
      let q = supabase.from('audit_log')
        .select('id, created_at, action, entity_type, entity_id, actor_id, group_id')
        .order('created_at', { ascending: false });
      q = applyDateRange(q, 'created_at', f);
      if (f.action) q = q.eq('action', f.action);
      if (f.group_id) q = q.eq('group_id', f.group_id);
      if (f.member_id) q = q.eq('actor_id', f.member_id);

      const [rows, names, groups] = await Promise.all([fetchAll(q), memberNames(), groupNames()]);
      const out = rows.map((e) => ({
        ...e,
        actor_name: e.actor_id ? names.byId.get(e.actor_id) ?? null : null,
        group_name: e.group_id ? groups.get(e.group_id) ?? null : null,
      }));
      return { rows: out, summary: { Events: out.length, ...countBy(out, 'action') } };
    },
  },

  'verification-history': {
    category: 'System Activity',
    label: 'Account Verification History',
    description: 'Chronological record of admin verification decisions and ID views.',
    dateLabel: 'When',
    filters: ['date', 'user', 'action'],
    actionSource: 'account',
    columns: [
      { key: 'created_at', label: 'When', type: 'datetime' },
      { key: 'action', label: 'Action' },
      { key: 'target_name', label: 'Account' },
      { key: 'actor_name', label: 'Administrator' },
      { key: 'detail', label: 'Detail' },
    ],
    async run(f) {
      let q = supabase.from('system_audit_log')
        .select('id, created_at, action, actor_id, target_type, target_id, metadata')
        .eq('target_type', 'account')
        .order('created_at', { ascending: false });
      q = applyDateRange(q, 'created_at', f);
      if (f.action) q = q.eq('action', f.action);
      if (f.member_id) q = q.eq('target_id', f.member_id);

      const [rows, names] = await Promise.all([fetchAll(q), memberNames()]);
      const out = rows.map((e) => ({
        ...e,
        // actor_id is an auth.users id, not members.id — map through auth_id.
        actor_name: e.actor_id ? names.byAuthId.get(e.actor_id) ?? null : null,
        target_name: e.target_id ? names.byId.get(e.target_id) ?? null : null,
        detail: describeMetadata(e.metadata),
      }));
      return { rows: out, summary: { Events: out.length, ...countBy(out, 'action') } };
    },
  },

  'admin-actions': {
    category: 'System Activity',
    label: 'Administrative Action Report',
    description: 'Every System Administrator action recorded in the system audit log.',
    dateLabel: 'When',
    filters: ['date', 'user', 'action'],
    actionSource: 'system',
    columns: [
      { key: 'created_at', label: 'When', type: 'datetime' },
      { key: 'actor_name', label: 'Administrator' },
      { key: 'action', label: 'Action' },
      { key: 'target_type', label: 'Target Type' },
      { key: 'target_name', label: 'Target' },
      { key: 'detail', label: 'Detail' },
    ],
    async run(f) {
      let q = supabase.from('system_audit_log')
        .select('id, created_at, action, actor_id, target_type, target_id, metadata')
        .order('created_at', { ascending: false });
      q = applyDateRange(q, 'created_at', f);
      if (f.action) q = q.eq('action', f.action);
      if (f.member_id) q = q.eq('target_id', f.member_id);

      const [rows, names, groups] = await Promise.all([fetchAll(q), memberNames(), groupNames()]);
      const out = rows.map((e) => ({
        ...e,
        actor_name: e.actor_id ? names.byAuthId.get(e.actor_id) ?? null : null,
        target_name: e.target_id
          ? names.byId.get(e.target_id) ?? groups.get(e.target_id) ?? null
          : null,
        detail: describeMetadata(e.metadata),
      }));
      return { rows: out, summary: { Actions: out.length, ...countBy(out, 'action') } };
    },
  },
};

// Audit metadata is free-form jsonb — render the fields we actually write
// (before/after on a status change, reason on a rejection) and fall back to
// a compact key: value list for anything else.
function describeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  if (metadata.reason) return String(metadata.reason);
  if (metadata.before || metadata.after) return `${metadata.before ?? '—'} → ${metadata.after ?? '—'}`;
  const parts = Object.entries(metadata).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return parts.length ? parts.join(', ') : null;
}

// The report catalogue the admin console builds its picker from.
function listReports() {
  return Object.entries(REPORTS).map(([key, r]) => ({
    key,
    category: r.category,
    label: r.label,
    description: r.description,
    dateLabel: r.dateLabel,
    filters: r.filters,
    statusOptions: r.statusOptions ?? null,
    actionSource: r.actionSource ?? null,
    columns: r.columns,
  }));
}

// Dropdown contents for the filter bar: groups, users, and the audit actions
// that actually occur in this database (no hardcoded guesses).
async function filterOptions() {
  const [groups, members, systemActions, groupActions] = await Promise.all([
    fetchAll(supabase.from('groups').select('id, name, fund_code, status').order('name')),
    fetchAll(supabase.from('members').select('id, full_name, email').order('full_name')),
    fetchAll(supabase.from('system_audit_log').select('action')),
    fetchAll(supabase.from('audit_log').select('action')),
  ]);

  const distinct = (rows) => [...new Set(rows.map((r) => r.action))].sort();
  const system = distinct(systemActions);

  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name, fund_code: g.fund_code, status: g.status })),
    members: members.map((m) => ({ id: m.id, name: m.full_name || m.email || m.id })),
    actions: {
      system,
      account: system.filter((a) => a.startsWith('account.')),
      group: distinct(groupActions),
    },
    statuses: {
      verification: ['unverified', 'pending', 'verified', 'rejected'],
      group: ['active', 'archived'],
      membership: ['pending', 'active', 'suspended', 'exited', 'rejected'],
    },
  };
}

async function runReport(key, filters) {
  const def = REPORTS[key];
  if (!def) return null;
  const { rows, summary } = await def.run(filters);
  return {
    key,
    label: def.label,
    description: def.description,
    columns: def.columns,
    rows,
    summary,
    row_count: rows.length,
    truncated: rows.length >= MAX_ROWS,
    generated_at: new Date().toISOString(),
  };
}

module.exports = { listReports, filterOptions, runReport };
