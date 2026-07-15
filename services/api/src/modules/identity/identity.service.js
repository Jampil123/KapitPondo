const supabase = require('../../config/supabase');

// `id_document_url` is actually a PATH inside the private `id-documents`
// bucket (see apps/mobile/src/lib/upload.ts) — it must be exchanged for a
// short-lived signed URL before the admin console can render it.
const ID_DOCUMENT_BUCKET = 'id-documents';
const SIGNED_URL_TTL = 300; // seconds

// One immutable row per sysadmin decision (system_audit_log — migration 0017).
async function writeAudit(actorId, action, targetId, metadata) {
  await supabase.from('system_audit_log').insert({
    actor_id: actorId,
    action,
    target_type: 'account',
    target_id: targetId,
    metadata,
  });
}

// Member submits (or resubmits) their identity document → status becomes 'pending'
async function submitDocument({
  memberId, idDocumentUrl, fullName, phone, idType, selfieUrl, email,
  firstName, middleName, lastName, birthday,
  nationality, region, province, city, barangay, streetAddress, zipCode,
  sourceOfFunds, employmentStatus, occupation,
}) {
  const update = {
    id_document_url: idDocumentUrl,
    verification_status: 'pending',
    updated_at: new Date().toISOString(),
  };
  if (fullName) update.full_name = fullName;
  if (phone) update.phone = phone;
  if (idType) update.id_type = idType;
  if (selfieUrl) update.selfie_url = selfieUrl;
  if (email) update.email = email;
  if (firstName) update.first_name = firstName;
  if (middleName) update.middle_name = middleName;
  if (lastName) update.last_name = lastName;
  if (birthday) update.birthday = birthday;
  if (firstName || lastName) {
    update.full_name = [firstName, middleName, lastName].filter(Boolean).join(' ') || fullName;
  }
  if (nationality) update.nationality = nationality;
  if (region) update.region = region;
  if (province) update.province = province;
  if (city) update.city = city;
  if (barangay) update.barangay = barangay;
  if (streetAddress) update.street_address = streetAddress;
  if (zipCode) update.zip_code = zipCode;
  if (sourceOfFunds) update.source_of_funds = sourceOfFunds;
  if (employmentStatus) update.employment_status = employmentStatus;
  if (occupation) update.occupation = occupation;

  // .single() throws (rather than returning null) when 0 rows match, which
  // broke the intended 409 "already verified/pending" response below —
  // .maybeSingle() returns null instead so that check actually runs.
  const { data, error } = await supabase
    .from('members')
    .update(update)
    .eq('id', memberId)
    .in('verification_status', ['unverified', 'rejected']) // can't resubmit once verified
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Member edits their own personal info — unlike submitDocument, not gated by
// verification_status and never touches id_document_url/selfie_url/id_type/
// verification_status (those are the KYC flow's job, not this one's).
async function updateProfile({
  memberId, fullName, firstName, middleName, lastName, email, birthday,
  nationality, region, province, city, barangay, streetAddress, zipCode,
  sourceOfFunds, employmentStatus, occupation, avatarUrl,
}) {
  const update = { updated_at: new Date().toISOString() };
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;
  if (email !== undefined) update.email = email;
  if (firstName !== undefined) update.first_name = firstName;
  if (middleName !== undefined) update.middle_name = middleName;
  if (lastName !== undefined) update.last_name = lastName;
  if (birthday !== undefined) update.birthday = birthday;
  if (firstName || lastName) {
    update.full_name = [firstName, middleName, lastName].filter(Boolean).join(' ') || fullName;
  } else if (fullName !== undefined) {
    update.full_name = fullName;
  }
  if (nationality !== undefined) update.nationality = nationality;
  if (region !== undefined) update.region = region;
  if (province !== undefined) update.province = province;
  if (city !== undefined) update.city = city;
  if (barangay !== undefined) update.barangay = barangay;
  if (streetAddress !== undefined) update.street_address = streetAddress;
  if (zipCode !== undefined) update.zip_code = zipCode;
  if (sourceOfFunds !== undefined) update.source_of_funds = sourceOfFunds;
  if (employmentStatus !== undefined) update.employment_status = employmentStatus;
  if (occupation !== undefined) update.occupation = occupation;

  const { data, error } = await supabase
    .from('members')
    .update(update)
    .eq('id', memberId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Sysadmin: list members by verification status (default: pending queue).
// status === 'all' returns every member regardless of verification status.
async function listForReview(status = 'pending') {
  let q = supabase
    .from('members')
    .select('id, full_name, email, phone, id_document_url, verification_status, created_at, id_type, city, province')
    .order('created_at', { ascending: true });
  if (status !== 'all') q = q.eq('verification_status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// `actorAuthId` is only passed when a sysadmin is inspecting another member's
// record (the admin detail view) — the member's own getMyProfile() call
// doesn't log anything. system_audit_log.actor_id references auth.users(id),
// not members(id), so this must be the auth user id, not the member row id.
async function getMember(id, actorAuthId) {
  const { data, error } = await supabase
    .from('members').select('*').eq('id', id).single();
  if (error) throw error;
  if (actorAuthId) await writeAudit(actorAuthId, 'account.id_viewed', id, null);

  let id_document_signed_url = null;
  if (data?.id_document_url) {
    const { data: signed } = await supabase.storage
      .from(ID_DOCUMENT_BUCKET)
      .createSignedUrl(data.id_document_url, SIGNED_URL_TTL);
    id_document_signed_url = signed?.signedUrl ?? null;
  }
  return { ...data, id_document_signed_url };
}

// Sysadmin approves a member. `reviewerId` (members.id) fills the members
// table's own verified_by column; `actorAuthId` (auth.users.id) is the actor
// on the system_audit_log row — two different id spaces.
async function approveMember({ memberId, reviewerId, actorAuthId }) {
  const { data, error } = await supabase
    .from('members')
    .update({
      verification_status: 'verified',
      verified_by: reviewerId,
      verified_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .eq('verification_status', 'pending')
    .select()
    .single();
  if (error) throw error;
  if (data) await writeAudit(actorAuthId, 'account.verified', memberId, { before: 'pending', after: 'verified' });
  return data;
}

// Sysadmin rejects a member (they may resubmit). `reason` has no dedicated
// column on members (none exists), so it's recorded on the audit row instead.
async function rejectMember({ memberId, actorAuthId, reason }) {
  const { data, error } = await supabase
    .from('members')
    .update({ verification_status: 'rejected' })
    .eq('id', memberId)
    .eq('verification_status', 'pending')
    .select()
    .single();
  if (error) throw error;
  if (data) await writeAudit(actorAuthId, 'account.rejected', memberId, { reason: reason ?? null });
  return data;
}

// The current member's own profile + status
async function getMyProfile(memberId) {
  return getMember(memberId);
}

module.exports = {
  submitDocument, updateProfile, listForReview, getMember,
  approveMember, rejectMember, getMyProfile,
};