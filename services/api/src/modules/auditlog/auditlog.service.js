// services/api/src/modules/auditlog/auditlog.service.js
// KapitPondo — Audit log read side (wired up for real, migration 0047) +
// the Auditor's Flag / Ask-for-proof actions on a posting.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { logAudit } = require('../../lib/auditLog');
const { withSubjects } = require('../../lib/auditSubjects');

// entity_type -> one of the four categories the Auditor screen filters by.
// Kept here (not in the DB) since it's a display grouping, not a stored fact.
const CATEGORY_BY_ENTITY = {
  contribution: 'money',
  expense: 'money',
  loan: 'money',
  loan_disbursement: 'money',
  loan_payment: 'money',
  ledger_adjustment: 'money',
  loan_decision: 'governance',
  membership_role: 'governance',
  membership_heads: 'governance',
  membership_approval: 'governance',
  distribution: 'governance',
  penalty: 'governance',
  audit_finding: 'governance',
  audit_flag: 'governance',
  reversal_request: 'reversals',
  cycle: 'settings',
  group_gcash: 'settings',
};

// The Audit trail screen's filter chips — groups of actions, not categories.
const KINDS = {
  recorded: { actions: ['recorded', 'initiated', 'posted', 'created', 'proposed'] },
  verifications: { actions: ['approved', 'confirmed', 'verified', 'finalized', 'rejected', 'disbursed'] },
  flags: { entityTypes: ['audit_flag', 'audit_finding'], actions: ['flagged', 'proof_requested'] },
  reversals: { entityTypes: ['reversal_request'] },
};

async function listAuditLog({ groupId, category, kind, search, before, limit = 30 }) {
  let q = supabase
    .from('audit_log')
    .select('*, actor:members!actor_id(full_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (category && category !== 'all') {
    const entityTypes = Object.entries(CATEGORY_BY_ENTITY)
      .filter(([, cat]) => cat === category)
      .map(([type]) => type);
    q = q.in('entity_type', entityTypes);
  }
  const k = KINDS[kind];
  if (k?.actions && k?.entityTypes) {
    q = q.or(`action.in.(${k.actions.join(',')}),entity_type.in.(${k.entityTypes.join(',')})`);
  } else if (k?.actions) {
    q = q.in('action', k.actions);
  } else if (k?.entityTypes) {
    q = q.in('entity_type', k.entityTypes);
  }
  if (before) q = q.lt('created_at', before);
  // Plain-column search only — before_data/after_data are JSON, not searched.
  if (search && search.trim()) q = q.ilike('action', `%${search.trim()}%`);

  const { data, error } = await q;
  if (error) throw error;
  const rows = await withSubjects(data);
  return rows.map((row) => ({ ...row, category: CATEGORY_BY_ENTITY[row.entity_type] ?? 'governance' }));
}

// Everything in a date range for the Auditor's exported report — not paged
// like listAuditLog, but capped so one export can't pull an unbounded table.
const EXPORT_LIMIT = 5000;

async function listAuditLogForExport({ groupId, from, to }) {
  let q = supabase
    .from('audit_log')
    .select('*, actor:members!actor_id(full_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(EXPORT_LIMIT);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lt('created_at', to);
  const { data, error } = await q;
  if (error) throw error;
  const rows = await withSubjects(data);
  return rows.map((row) => ({ ...row, category: CATEGORY_BY_ENTITY[row.entity_type] ?? 'governance' }));
}

// The Auditor asks whoever recorded a proof-less posting to supply one.
// Real notification to the recorder, not a canned contribution-arrears nudge
// (that's nudgeMember, a different concern — see groups.service.js).
async function askForProof({ groupId, actorId, actorRole, entityType, entityId, recordedBy, label }) {
  await logAudit({
    groupId, actorId, actorRole,
    action: 'proof_requested', entityType, entityId,
    before: null, after: null,
  });

  if (recordedBy) {
    await notify({
      memberId: recordedBy,
      groupId,
      type: 'audit.proof_requested',
      title: 'A receipt is needed',
      message: label ? `The Auditor asked for proof on: ${label}` : 'The Auditor asked you to attach proof for a posting you recorded.',
    });
  }
}

module.exports = { listAuditLog, listAuditLogForExport, EXPORT_LIMIT, CATEGORY_BY_ENTITY, askForProof };
