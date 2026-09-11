// services/api/src/modules/auditlog/auditlog.service.js
// KapitPondo — Audit log read side (wired up for real, migration 0047) +
// the Auditor's Flag / Ask-for-proof actions on a posting.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { logAudit } = require('../../lib/auditLog');

// entity_type -> one of the four categories the Auditor screen filters by.
// Kept here (not in the DB) since it's a display grouping, not a stored fact.
const CATEGORY_BY_ENTITY = {
  contribution: 'money',
  expense: 'money',
  loan_disbursement: 'money',
  loan_payment: 'money',
  ledger_adjustment: 'money',
  loan_decision: 'governance',
  membership_role: 'governance',
  membership_heads: 'governance',
  membership_approval: 'governance',
  distribution: 'governance',
  penalty: 'governance',
  reversal_request: 'reversals',
  cycle: 'settings',
  group_gcash: 'settings',
};

async function listAuditLog({ groupId, category, search, before, limit = 30 }) {
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
  if (before) q = q.lt('created_at', before);
  // Plain-column search only — before_data/after_data are JSON, not searched.
  if (search && search.trim()) q = q.ilike('action', `%${search.trim()}%`);

  const { data, error } = await q;
  if (error) throw error;
  return data.map((row) => ({ ...row, category: CATEGORY_BY_ENTITY[row.entity_type] ?? 'governance' }));
}

async function getOwnerMemberId(groupId) {
  const { data, error } = await supabase.from('groups').select('owner_id').eq('id', groupId).single();
  if (error) throw error;
  return data.owner_id;
}

// The Auditor flags a posting they've already reviewed as a concern — a
// note attached to the record, sent to the Owner. Deliberately NOT a ledger
// change: correcting the numbers still goes through the real reversal
// workflow (ledger.routes.js) with all three officers. This is oversight
// commentary, not a correction.
async function flagPosting({ groupId, actorId, actorRole, entityType, entityId, note, label }) {
  await logAudit({
    groupId, actorId, actorRole,
    action: 'flagged', entityType, entityId,
    before: null, after: { note: note ?? null },
  });

  const ownerId = await getOwnerMemberId(groupId);
  if (ownerId) {
    await notify({
      memberId: ownerId,
      groupId,
      type: 'audit.flagged',
      title: 'Auditor flagged a posting',
      message: label ? `${label}${note ? `: ${note}` : ''}` : (note ?? 'A posting was flagged for review.'),
    });
  }
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

module.exports = { listAuditLog, CATEGORY_BY_ENTITY, flagPosting, askForProof };
