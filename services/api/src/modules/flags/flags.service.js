// services/api/src/modules/flags/flags.service.js
// KapitPondo — Audit flags (migration 0070): the Auditor flags one record,
// the Organizer resolves or dismisses it. Each flag carries a per-group
// number (FL-07) and, when listed, a summary of the record it points at so
// the app can show "Contribution from Ana Cruz · ₱1,000.00" without a
// second round-trip per row.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { logAudit } = require('../../lib/auditLog');
const { withSubjects } = require('../../lib/auditSubjects');

const CLOSED_STATUSES = ['resolved', 'dismissed'];
const SELECT = '*, raiser:members!raised_by(full_name), resolver:members!resolved_by(full_name)';

const CONTRIBUTION_SELECT = 'id, amount, status, payment_method, external_reference, created_at, recorder:members!recorded_by(full_name), approver:members!approved_by(full_name), memberships!membership_id(members!member_id(full_name))';
const PAYMENT_SELECT = 'id, amount, principal_portion, interest_portion, status, payment_method, external_reference, created_at, recorder:members!recorded_by(full_name), verifier:members!approved_by(full_name), loans(loan_no, membership:memberships!membership_id(members!member_id(full_name)))';
const LOAN_SELECT = 'id, loan_no, principal, approved_principal, status, applied_at, disbursed_at, approver:members!approved_by(full_name), disburser:members!disbursed_by(full_name), membership:memberships!membership_id(members!member_id(full_name))';

function flagRef(seq) {
  return `FL-${String(seq).padStart(2, '0')}`;
}

// One lookup per entity type for the whole list, not per item. Takes any
// { entity_type, entity_id } list (flags, ledger entries' sources) and returns
// a map of entity_id -> record summary.
async function recordSummaries(items) {
  const ids = (type) => [...new Set(items.filter((f) => f.entity_type === type).map((f) => f.entity_id))];
  const byId = new Map();

  const contributionIds = ids('contribution');
  if (contributionIds.length) {
    const { data, error } = await supabase.from('contributions').select(CONTRIBUTION_SELECT).in('id', contributionIds);
    if (error) throw error;
    data.forEach((c) => byId.set(c.id, {
      kind: 'Contribution', name: c.memberships?.members?.full_name ?? null, amount: c.amount, status: c.status,
      posted_at: c.created_at, channel: c.payment_method, reference: c.external_reference,
      recorded_by: c.recorder?.full_name ?? null, verified_by: c.approver?.full_name ?? null,
    }));
  }

  const paymentIds = ids('loan_payment');
  if (paymentIds.length) {
    const { data, error } = await supabase.from('loan_payments').select(PAYMENT_SELECT).in('id', paymentIds);
    if (error) throw error;
    data.forEach((p) => byId.set(p.id, {
      kind: 'Loan repayment', name: p.loans?.membership?.members?.full_name ?? null, amount: p.amount, status: p.status,
      loan_no: p.loans?.loan_no ?? null,
      posted_at: p.created_at, channel: p.payment_method, reference: p.external_reference,
      recorded_by: p.recorder?.full_name ?? null, verified_by: p.verifier?.full_name ?? null,
      principal: p.principal_portion, interest: p.interest_portion,
    }));
  }

  const loanIds = [...ids('loan'), ...ids('loan_disbursement')];
  if (loanIds.length) {
    const { data, error } = await supabase.from('loans').select(LOAN_SELECT).in('id', loanIds);
    if (error) throw error;
    data.forEach((l) => byId.set(l.id, {
      kind: l.disbursed_at ? 'Loan release' : 'Loan', name: l.membership?.members?.full_name ?? null,
      loan_no: l.loan_no ?? null,
      amount: l.approved_principal ?? l.principal, status: l.status,
      posted_at: l.disbursed_at ?? l.applied_at, channel: null, reference: null,
      recorded_by: l.approver?.full_name ?? null, verified_by: l.disburser?.full_name ?? null,
    }));
  }

  // The posting each record produced, if it's been posted.
  const sourceIds = [...byId.keys()];
  if (sourceIds.length) {
    const { data, error } = await supabase
      .from('ledger_entries').select('source_id, entry_no')
      .in('source_id', sourceIds).neq('entry_type', 'reversal');
    if (error) throw error;
    data.forEach((e) => {
      const r = byId.get(e.source_id);
      if (r && r.entry_no == null) r.entry_no = e.entry_no;
    });
  }

  return byId;
}

async function summarizeRecords(flags) {
  const byId = await recordSummaries(flags);
  return flags.map((f) => ({
    ...f,
    ref: flagRef(f.seq),
    record: byId.get(f.entity_id) ?? { kind: f.entity_type.replace(/_/g, ' '), name: null, amount: null, status: null, posted_at: null, channel: null, reference: null, recorded_by: null, verified_by: null },
  }));
}

async function listFlags({ groupId, status }) {
  let q = supabase
    .from('audit_flags')
    .select(SELECT)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status === 'open') q = q.eq('status', 'open');
  else if (status === 'closed') q = q.in('status', CLOSED_STATUSES);
  const { data, error } = await q;
  if (error) throw error;
  return summarizeRecords(data);
}

/** One flag, its record, and everything the audit trail holds on that record (oldest first). */
async function getFlagDetail({ groupId, flagId }) {
  const { data: flag, error } = await supabase.from('audit_flags').select(SELECT).eq('id', flagId).eq('group_id', groupId).maybeSingle();
  if (error) throw error;
  if (!flag) return null;
  const [withRecord] = await summarizeRecords([flag]);

  const { data: history, error: hErr } = await supabase
    .from('audit_log')
    .select('*, actor:members!actor_id(full_name)')
    .eq('group_id', groupId)
    .in('entity_id', [flag.entity_id, flag.id])
    .order('created_at', { ascending: true })
    .limit(100);
  if (hErr) throw hErr;

  return { flag: withRecord, history: await withSubjects(history) };
}

async function getOwnerMemberId(groupId) {
  const { data, error } = await supabase.from('groups').select('owner_id').eq('id', groupId).single();
  if (error) throw error;
  return data.owner_id;
}

async function nextSeq(groupId) {
  const { data, error } = await supabase
    .from('audit_flags').select('seq').eq('group_id', groupId)
    .order('seq', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data?.seq ?? 0) + 1;
}

async function raiseFlag({ groupId, actorId, actorRole, entityType, entityId, reason, note, label }) {
  let flag = null;
  // Two flags raised at the same moment can race for a number — retry once on the unique clash.
  for (let attempt = 0; attempt < 2 && !flag; attempt++) {
    const seq = await nextSeq(groupId);
    const { data, error } = await supabase
      .from('audit_flags')
      .insert({ group_id: groupId, seq, raised_by: actorId, entity_type: entityType, entity_id: entityId, reason, note: note ?? null })
      .select(SELECT)
      .single();
    if (error && error.code === '23505' && attempt === 0) continue;
    if (error) throw error;
    flag = data;
  }

  await logAudit({
    groupId, actorId, actorRole,
    action: 'flagged', entityType, entityId,
    before: null, after: { flag: flagRef(flag.seq), reason, note: note ?? null },
  });

  const ownerId = await getOwnerMemberId(groupId);
  if (ownerId) {
    await notify({
      memberId: ownerId,
      groupId,
      type: 'audit.flagged',
      title: `Auditor raised ${flagRef(flag.seq)}`,
      message: label ? `${label}: ${reason}` : reason,
    });
  }
  return flag;
}

async function getFlag(id) {
  const { data, error } = await supabase.from('audit_flags').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return data;
}

async function closeFlag({ groupId, flagId, actorId, actorRole, status, note }) {
  const { data, error } = await supabase
    .from('audit_flags')
    .update({ status, resolution_note: note, resolved_by: actorId, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', flagId)
    .eq('group_id', groupId)
    .eq('status', 'open')
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  await logAudit({
    groupId, actorId, actorRole,
    action: status, entityType: 'audit_flag', entityId: flagId,
    before: { status: 'open' }, after: { status, note },
  });

  await notify({
    memberId: data.raised_by,
    groupId,
    type: 'audit.flag_closed',
    title: `${flagRef(data.seq)} ${status}`,
    message: note ?? data.reason,
  });
  return data;
}

module.exports = { CLOSED_STATUSES, flagRef, recordSummaries, listFlags, getFlagDetail, raiseFlag, getFlag, closeFlag };
