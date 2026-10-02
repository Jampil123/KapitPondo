// services/api/src/modules/ledger/ledger.service.js
// KapitPondo — Ledger corrections service (M7, FINAL)
//
// Reversal workflow (UC-LG-01..03): the Treasurer starts a request (nothing
// posted yet) -> the Auditor verifies or rejects it -> the Organizer approves
// or rejects it. Approving (approve_reversal, migration 0063) is the only
// point the reversing entry is posted, and it undoes the record behind it.
// The append-only ledger is untouched until then.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const officers = require('../../lib/officers');
const { signProofUrl } = require('../../lib/proofUrl');

const conflict = (message) => Object.assign(new Error(message), { status: 409 });

async function rpc409(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.code === 'P0001') throw conflict(error.message);
    throw error;
  }
  return data;
}

// "LE-1043 · Contribution, Maria Santos · ₱10,000.00" — for notifications.
async function entryLabel(entry) {
  let who = null;
  if (entry.membership_id) {
    const { data } = await supabase.from('memberships').select('members!member_id(full_name)').eq('id', entry.membership_id).maybeSingle();
    who = data?.members?.full_name ?? null;
  }
  const type = entry.entry_type.replace(/_/g, ' ');
  const amount = `₱${Number(entry.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  return `LE-${1000 + (entry.entry_no ?? 0)} · ${type}${who ? `, ${who}` : ''} · ${amount}`;
}

async function getEntry(id) {
  const { data, error } = await supabase
    .from('ledger_entries').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function initiateReversal({ entryId, groupId, reason, initiatedBy }) {
  const entry = await getEntry(entryId);
  const block = await rpc409('reversal_block', { p_entry_id: entryId });
  if (block) throw conflict(block);

  const { data: existing, error: eErr } = await supabase
    .from('ledger_reversal_requests')
    .select('id')
    .eq('entry_id', entryId)
    .in('status', ['pending_verification', 'verified', 'finalized'])
    .limit(1);
  if (eErr) throw eErr;
  if (existing.length) throw conflict('This entry already has a reversal in progress');

  const { data, error } = await supabase
    .from('ledger_reversal_requests')
    .insert({ group_id: groupId, entry_id: entryId, reason, initiated_by: initiatedBy })
    .select()
    .single();
  if (error) throw error;

  await officers.notifyRole({
    groupId, role: 'auditor', skip: [initiatedBy],
    type: 'reversal.to_verify', title: 'Reversal to verify',
    message: `${await entryLabel(entry)}. Reason: ${reason}`,
  });
  return data;
}

const REQUEST_NAMES = 'initiator:members!initiated_by(full_name), verifier:members!verified_by(full_name), rejecter:members!rejected_by(full_name), finalizer:members!finalized_by(full_name)';

async function listReversalRequests({ groupId, status }) {
  let q = supabase
    .from('ledger_reversal_requests')
    .select(`*, entry:ledger_entries!entry_id(*, membership:memberships!membership_id(member_id, members!member_id(full_name))), ${REQUEST_NAMES}`)
    .eq('group_id', groupId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getReversalRequest(id) {
  const { data, error } = await supabase
    .from('ledger_reversal_requests').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Why the caller may not verify/reject this reversal, or null if they may. The
// Auditor reviews reversals, but never a correction to their own transaction;
// when the entry is the Auditor's own, another officer who didn't request the
// reversal reviews it instead so it can't sit unreviewed.
async function reversalReviewBlock({ requestId, groupId, memberId, membershipId, role }) {
  const request = await getReversalRequest(requestId);
  if (request.group_id !== groupId) return 'Reversal request does not belong to this group';
  const entry = await getEntry(request.entry_id);
  if (entry.membership_id && entry.membership_id === membershipId) {
    return 'You cannot review a correction to your own transaction';
  }
  if (role === 'auditor') return null;

  let entryRole = null;
  if (entry.membership_id) {
    const { data } = await supabase.from('memberships').select('role').eq('id', entry.membership_id).maybeSingle();
    entryRole = data?.role ?? null;
  }
  if (entryRole !== 'auditor') return 'Only the Auditor reviews reversals';
  if (request.initiated_by === memberId) return 'You cannot review a correction you requested';
  return null;
}

async function verifyReversal({ requestId, verifiedBy, notes }) {
  const { data, error } = await supabase
    .from('ledger_reversal_requests')
    .update({
      status: 'verified',
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verify_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending_verification')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await officers.notifyRole({
      groupId: data.group_id, role: 'owner', skip: [verifiedBy, data.initiated_by],
      type: 'reversal.to_approve', title: 'Reversal to approve',
      message: `${await entryLabel(await getEntry(data.entry_id))}. Verified by the Auditor.`,
    });
  }
  return data;
}

// Rejected by the Auditor (while pending verification) or the Organizer (once
// verified) — nothing is posted, and the Treasurer who started it hears why.
async function rejectReversal({ requestId, rejectedBy, reason, fromStatus }) {
  const { data, error } = await supabase
    .from('ledger_reversal_requests')
    .update({
      status: 'rejected',
      rejected_by: rejectedBy,
      rejected_at: new Date().toISOString(),
      reject_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', fromStatus)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await notify({
      memberId: data.initiated_by, groupId: data.group_id,
      type: 'reversal.rejected', title: 'Reversal rejected',
      message: `${await entryLabel(await getEntry(data.entry_id))}. The entry stands. Reason: ${reason}`,
    });
  }
  return data;
}

async function finalizeReversal({ requestId, finalizedBy }) {
  const request = await rpc409('approve_reversal', { p_request_id: requestId, p_actor_id: finalizedBy });
  const [originalEntry, reversalEntry] = await Promise.all([getEntry(request.entry_id), getEntry(request.reversal_entry_id)]);
  const label = await entryLabel(originalEntry);

  if (originalEntry.membership_id) {
    const { data: membership } = await supabase
      .from('memberships').select('member_id').eq('id', originalEntry.membership_id).maybeSingle();
    if (membership) {
      await notify({
        memberId: membership.member_id,
        groupId: request.group_id,
        type: 'ledger.reversed',
        title: 'A ledger entry was corrected',
        message: `${label} was reversed: ${request.reason}`,
      });
    }
  }
  await notify({
    memberId: request.initiated_by, groupId: request.group_id,
    type: 'ledger.reversed', title: 'Reversal approved',
    message: `${label} was reversed. Record the correct amount through the normal flow if needed.`,
  });

  return { request, reversalEntry };
}

async function postAdjustment({ groupId, membershipId, direction, amount, reason, postedBy }) {
  const { data, error } = await supabase.rpc('post_adjustment', {
    p_group_id: groupId,
    p_membership_id: membershipId || null,
    p_direction: direction,
    p_amount: amount,
    p_reason: reason,
    p_posted_by: postedBy,
  });
  if (error) throw error;
  return data;
}

// Ledger source_type -> the entity type flags and the audit trail use for that record.
const SOURCE_ENTITY = { contribution: 'contribution', loan_payment: 'loan_payment', loan: 'loan_disbursement', expense: 'expense' };

/**
 * One posting for the officers' entry page: the entry, a summary of the
 * record behind it (who recorded/verified, channel, reference...), the entry
 * that reversed it if any, and the audit trail on both (oldest first).
 */
async function entryDetail({ groupId, entryId }) {
  const { recordSummaries } = require('../flags/flags.service');
  const { withSubjects } = require('../../lib/auditSubjects');
  const { data: entry, error } = await supabase
    .from('ledger_entries')
    .select('*, poster:members!posted_by(full_name), membership:memberships!membership_id(member_id, members!member_id(full_name, avatar_url))')
    .eq('id', entryId).eq('group_id', groupId).maybeSingle();
  if (error) throw error;
  if (!entry) return null;

  // Repayment entries posted before 0075 point at the loan, not the payment —
  // the payment's own ledger_entry_id finds it either way.
  let entityType = SOURCE_ENTITY[entry.source_type] ?? null;
  let sourceId = entry.source_id;
  if (entry.entry_type === 'loan_repayment') {
    const { data: payment, error: pErr } = await supabase.from('loan_payments').select('id').eq('ledger_entry_id', entry.id).maybeSingle();
    if (pErr) throw pErr;
    entityType = payment ? 'loan_payment' : null;
    sourceId = payment?.id ?? null;
  }
  const records = entityType && sourceId ? await recordSummaries([{ entity_type: entityType, entity_id: sourceId }]) : new Map();

  // The proof behind a payment, so a reversal can be checked against it.
  let proofUrl = null;
  const proofTable = { contribution: 'contributions', loan_payment: 'loan_payments' }[entityType];
  if (proofTable && sourceId) {
    const { data: src } = await supabase.from(proofTable).select('proof_url').eq('id', sourceId).maybeSingle();
    proofUrl = await signProofUrl(src?.proof_url ?? null);
  }

  const [{ data: reversedBy, error: rErr }, { data: requests, error: qErr }] = await Promise.all([
    supabase.from('ledger_entries').select('id, entry_no, posted_at').eq('reverses_entry_id', entryId).maybeSingle(),
    supabase.from('ledger_reversal_requests')
      .select(`*, ${REQUEST_NAMES}`)
      .eq('entry_id', entryId).order('created_at', { ascending: false }),
  ]);
  if (rErr) throw rErr;
  if (qErr) throw qErr;

  const trailIds = [entry.id, sourceId, ...(requests ?? []).map((r) => r.id)].filter(Boolean);
  const { data: history, error: hErr } = await supabase
    .from('audit_log')
    .select('*, actor:members!actor_id(full_name)')
    .eq('group_id', groupId)
    .in('entity_id', trailIds)
    .order('created_at', { ascending: true })
    .limit(100);
  if (hErr) throw hErr;

  return {
    entry,
    entity_type: entityType,
    source_id: sourceId,
    record: sourceId ? records.get(sourceId) ?? null : null,
    reversed_by: reversedBy ?? null,
    reversal_request: requests?.[0] ?? null,
    proof_url: proofUrl,
    can_reverse: !(await rpc409('reversal_block', { p_entry_id: entryId }).catch(() => 'unavailable')),
    history: await withSubjects(history),
  };
}

module.exports = {
  entryDetail,
  getEntry,
  initiateReversal,
  listReversalRequests,
  getReversalRequest,
  reversalReviewBlock,
  verifyReversal,
  rejectReversal,
  finalizeReversal,
  postAdjustment,
};
