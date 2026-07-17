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

module.exports = {
  getEntry,
  initiateReversal,
  listReversalRequests,
  getReversalRequest,
  verifyReversal,
  rejectReversal,
  finalizeReversal,
  postAdjustment,
};
