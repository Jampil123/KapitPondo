const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');

// Kept in sync with the CHECK constraint in 0061_profile_update_requests.sql
// and with exactly the fields edit-profile.tsx edits — nothing KYC-photo/
// ID-document related belongs here, that's the identity/re-verification
// pipeline's job.
const LOCKABLE_FIELDS = [
  'first_name', 'middle_name', 'last_name', 'birthday', 'nationality',
  'region', 'province', 'city', 'barangay', 'street_address', 'zip_code',
  'source_of_funds', 'employment_status', 'occupation',
];

const REASONS = ['typo', 'legal_name_change', 'other'];

async function submitRequest({ memberId, field, currentValue, newValue, reason, details, proofUrl }) {
  if (!LOCKABLE_FIELDS.includes(field)) {
    throw Object.assign(new Error('Unsupported field for an update request'), { status: 400 });
  }
  if (!REASONS.includes(reason)) {
    throw Object.assign(new Error('reason must be one of: ' + REASONS.join(', ')), { status: 400 });
  }
  const trimmedNewValue = typeof newValue === 'string' ? newValue.trim() : '';
  if (!trimmedNewValue) {
    throw Object.assign(new Error('new_value is required'), { status: 400 });
  }

  const { data, error } = await supabase
    .from('profile_update_requests')
    .insert({
      member_id: memberId,
      field,
      current_value: currentValue ?? null,
      new_value: trimmedNewValue,
      reason,
      details: details || null,
      proof_url: proofUrl || null,
      // Only a legal name change calls the verified identity itself into
      // question — a typo or address/financial correction doesn't.
      requires_reverification: reason === 'legal_name_change',
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listMyRequests(memberId) {
  const { data, error } = await supabase
    .from('profile_update_requests')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getRequest(id) {
  const { data, error } = await supabase
    .from('profile_update_requests').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Sysadmin-only (services/api/src/routes/admin/profileUpdateRequests.js).
// Writes the approved value to the member's own row, then — only when the
// request was flagged at submission time — sends the member back through
// the existing identity capture pipeline instead of inventing a second one.
async function approveRequest({ requestId, approverId }) {
  const request = await getRequest(requestId);
  if (request.status !== 'pending') {
    throw Object.assign(new Error('Request has already been reviewed'), { status: 409 });
  }

  const memberUpdate = { [request.field]: request.new_value, updated_at: new Date().toISOString() };
  if (request.requires_reverification) {
    memberUpdate.verification_status = 'unverified';
  }
  const { error: memberErr } = await supabase
    .from('members').update(memberUpdate).eq('id', request.member_id);
  if (memberErr) throw memberErr;

  const { data, error } = await supabase
    .from('profile_update_requests')
    .update({ status: 'approved', reviewed_by: approverId, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();
  if (error) throw error;

  await notify({
    memberId: request.member_id,
    type: 'profile_update.approved',
    title: 'Update request approved',
    message: request.requires_reverification
      ? 'Your information update was approved. Since it affects your verified identity, please verify your account again.'
      : 'Your information update was approved.',
  });

  return data;
}

async function rejectRequest({ requestId, approverId, reason }) {
  const { data, error } = await supabase
    .from('profile_update_requests')
    .update({
      status: 'rejected',
      reviewed_by: approverId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || null,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select()
    .single();
  if (error) throw error;

  if (data) {
    await notify({
      memberId: data.member_id,
      type: 'profile_update.rejected',
      title: 'Update request rejected',
      message: reason ? `Your information update request was rejected: ${reason}` : 'Your information update request was rejected.',
    });
  }

  return data;
}

module.exports = {
  LOCKABLE_FIELDS,
  submitRequest,
  listMyRequests,
  getRequest,
  approveRequest,
  rejectRequest,
};
