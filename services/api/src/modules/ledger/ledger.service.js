// services/api/src/modules/ledger/ledger.service.js
// KapitPondo — Ledger corrections service (M7, FINAL)
//
// Reversal workflow (TC-021, TC-026): Treasurer/Owner initiates a request
// (no ledger entry posted yet) -> Auditor verifies or rejects it -> Owner
// finalizes a verified request, which is the only point the actual
// reversing entry gets posted via the existing reverse_ledger_entry RPC.
// The append-only ledger is untouched until finalization.

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

async function getEntry(id) {
  const { data, error } = await supabase
    .from('ledger_entries').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function initiateReversal({ entryId, groupId, reason, initiatedBy }) {
  const entry = await getEntry(entryId);
  if (entry.entry_type === 'reversal') {
    throw Object.assign(new Error('Cannot reverse a reversal entry'), { status: 409 });
  }

  const { data: existing } = await supabase
    .from('ledger_reversal_requests')
    .select('id')
    .eq('entry_id', entryId)
    .in('status', ['pending_verification', 'verified', 'finalized'])
    .maybeSingle();
  if (existing) {
    throw Object.assign(new Error('This entry already has an active or completed reversal request'), { status: 409 });
  }

  const { data, error } = await supabase
    .from('ledger_reversal_requests')
    .insert({ group_id: groupId, entry_id: entryId, reason, initiated_by: initiatedBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listReversalRequests({ groupId, status }) {
  let q = supabase
    .from('ledger_reversal_requests')
    .select('*, entry:ledger_entries!entry_id(*)')
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
    .single();
  if (error) throw error;
  return data;
}

async function rejectReversal({ requestId, verifiedBy, notes }) {
  const { data, error } = await supabase
    .from('ledger_reversal_requests')
    .update({
      status: 'rejected',
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verify_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending_verification')
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function finalizeReversal({ requestId, finalizedBy }) {
  const request = await getReversalRequest(requestId);
  if (request.status !== 'verified') {
    throw Object.assign(new Error('Reversal request is not verified'), { status: 409 });
  }

  const { data: reversalEntry, error } = await supabase.rpc('reverse_ledger_entry', {
    p_entry_id: request.entry_id,
    p_reason: request.reason,
    p_posted_by: finalizedBy,
  });
  if (error) throw error;

  const { data: updated, error: uErr } = await supabase
    .from('ledger_reversal_requests')
    .update({
      status: 'finalized',
      finalized_by: finalizedBy,
      finalized_at: new Date().toISOString(),
      reversal_entry_id: reversalEntry.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();
  if (uErr) throw uErr;

  const originalEntry = await getEntry(request.entry_id);
  if (originalEntry.membership_id) {
    const { data: membership } = await supabase
      .from('memberships').select('member_id').eq('id', originalEntry.membership_id).maybeSingle();
    if (membership) {
      await notify({
        memberId: membership.member_id,
        groupId: request.group_id,
        type: 'ledger.reversed',
        title: 'A ledger entry was corrected',
        message: `A ${originalEntry.entry_type} entry on your account was reversed: ${request.reason}`,
      });
    }
  }

  return { request: updated, reversalEntry };
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

  const entityType = SOURCE_ENTITY[entry.source_type] ?? null;
  const records = entityType && entry.source_id ? await recordSummaries([{ entity_type: entityType, entity_id: entry.source_id }]) : new Map();

  const [{ data: reversedBy, error: rErr }, { data: requests, error: qErr }] = await Promise.all([
    supabase.from('ledger_entries').select('id, entry_no, posted_at').eq('reverses_entry_id', entryId).maybeSingle(),
    supabase.from('ledger_reversal_requests').select('id').eq('entry_id', entryId),
  ]);
  if (rErr) throw rErr;
  if (qErr) throw qErr;

  const trailIds = [entry.id, entry.source_id, ...(requests ?? []).map((r) => r.id)].filter(Boolean);
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
    record: entry.source_id ? records.get(entry.source_id) ?? null : null,
    reversed_by: reversedBy ?? null,
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
