const supabase = require('../../config/supabase');
const { notify, notifyAdmins } = require('../../lib/notifications');

// `id_document_url` is actually a PATH inside the private `id-documents`
// bucket (see apps/mobile/src/lib/upload.ts) — it must be exchanged for a
// short-lived signed URL before the admin console can render it.
const ID_DOCUMENT_BUCKET = 'id-documents';
const SIGNED_URL_TTL = 300; // seconds

// Each ID submission is its own identity_submissions row; members only holds
// the current verification_status. The member payloads this module returns
// still carry the latest submission's fields (id_type, id_document_url, …,
// verification_rejection_reason) so the apps read them as before.
const SUBMISSION_EMBED = 'identity_submissions!identity_submissions_member_id_fkey';

// One immutable row per sysadmin decision (system_audit_log).
async function writeAudit(actorId, action, targetId, metadata) {
  await supabase.from('system_audit_log').insert({
    actor_id: actorId,
    action,
    target_type: 'account',
    target_id: targetId,
    metadata,
  });
}

async function latestSubmission(memberId) {
  const { data, error } = await supabase
    .from('identity_submissions')
    .select('*')
    .eq('member_id', memberId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function withSubmission(member, sub) {
  const { identity_submissions: _embedded, ...rest } = member;
  const turnedDown = sub && (sub.status === 'resubmission_required' || sub.status === 'rejected');
  return {
    ...rest,
    id_type: sub?.id_type ?? null,
    id_number: sub?.id_number ?? null,
    id_document_url: sub?.id_document_url ?? null,
    id_document_back_url: sub?.id_document_back_url ?? null,
    id_document_qr_data: sub?.id_document_qr_data ?? null,
    selfie_url: sub?.selfie_url ?? null,
    submitted_at: sub?.submitted_at ?? null,
    verification_rejection_reason: turnedDown ? sub.reason : null,
    verified_by: sub?.status === 'verified' ? sub.reviewed_by : null,
  };
}

// Member submits (or resubmits) their identity document → a new submission
// row in 'pending', and the member's status becomes 'pending'.
async function submitDocument({
  memberId, idDocumentUrl, idDocumentBackUrl, idDocumentQrData, fullName, phone, idType, selfieUrl, email,
  firstName, middleName, lastName, birthday, sex, idNumber,
  nationality, region, province, city, barangay, streetAddress, zipCode,
  sourceOfFunds, employmentStatus, occupation,
}) {
  // can't resubmit once verified, while in review, or after a final rejection
  const { data: current, error: curErr } = await supabase
    .from('members').select('verification_status').eq('id', memberId).maybeSingle();
  if (curErr) throw curErr;
  if (!current || !['unverified', 'resubmission_required'].includes(current.verification_status)) return null;

  const { data: sub, error: subErr } = await supabase
    .from('identity_submissions')
    .insert({
      member_id: memberId,
      id_type: idType ?? null,
      id_number: idNumber ?? null,
      id_document_url: idDocumentUrl,
      id_document_back_url: idDocumentBackUrl ?? null,
      id_document_qr_data: idDocumentQrData ?? null,
      selfie_url: selfieUrl ?? null,
    })
    .select()
    .single();
  // 23505: a submission is already in review (one_pending_identity_submission)
  if (subErr) { if (subErr.code === '23505') return null; throw subErr; }

  const update = { verification_status: 'pending', updated_at: new Date().toISOString() };
  if (fullName) update.full_name = fullName;
  if (phone) update.phone = phone;
  if (email) update.email = email;
  if (firstName) update.first_name = firstName;
  if (middleName) update.middle_name = middleName;
  if (lastName) update.last_name = lastName;
  if (birthday) update.birthday = birthday;
  if (sex) update.sex = sex;
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

  const { data, error } = await supabase
    .from('members')
    .update(update)
    .eq('id', memberId)
    .in('verification_status', ['unverified', 'resubmission_required'])
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Member edits their own personal info — unlike submitDocument, not gated by
// verification_status and never touches the ID submission or the status
// (those are the KYC flow's job, not this one's).
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
  return withSubmission(data, await latestSubmission(memberId));
}

// Whether members.suspended_at exists (migration 0057). Starts unknown and is
// latched to false the first time Postgres says the column isn't there, so the
// admin queue degrades to its pre-suspension behaviour instead of 500ing.
let suspensionAvailable = null;
function isMissingSuspensionColumn(error) {
  return error?.code === '42703' || /suspended_at/.test(error?.message ?? '');
}

// Sysadmin: list members by verification status (default: pending queue).
//   'all'             — every member
//   'suspended'       — platform-suspended accounts (migration 0057)
//   'group_suspended' — members a group's officers suspended inside a group
//   anything else     — that verification_status
async function listForReview(status = 'pending') {
  let q = supabase
    .from('members')
    .select('id, full_name, email, phone, id_document_url, verification_status, created_at, id_type, city, province')
    .order('created_at', { ascending: true });
  if (status !== 'all') q = q.eq('verification_status', status);
  const { data, error } = await q;
  if (error) {
    if (isMissingSuspensionColumn(error)) { suspensionAvailable = false; return listForReview(status); }
    throw error;
  }
  return data;
}

// Sysadmin suspends an account: platform access is withdrawn until reinstated
// (middleware/auth.js blocks the suspended member on their next request).
// Verification status is left alone — suspension is a separate axis.
async function suspendMember({ memberId, adminMemberId, actorAuthId, reason }) {
  const { data, error } = await supabase
    .from('members')
    .update({
      suspended_at: new Date().toISOString(),
      suspended_by: adminMemberId,
      suspension_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .is('suspended_at', null) // already-suspended accounts are a no-op, not a re-suspend
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await writeAudit(actorAuthId, 'account.suspended', memberId, { reason: reason ?? null });
    await notify({
      memberId,
      type: 'account.suspended',
      title: 'Account suspended',
      message: reason ? `Your account has been suspended: ${reason}` : 'Your account has been suspended. Contact support for help.',
    });
  }
  return data;
}

async function reinstateMember({ memberId, actorAuthId }) {
  const { data, error } = await supabase
    .from('members')
    .update({
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .not('suspended_at', 'is', null)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// `actorAuthId` is only passed when a sysadmin is inspecting another member's
// record (the admin detail view) — the member's own getMyProfile() call
// doesn't log anything. system_audit_log.actor_id references auth.users(id),
// not members(id), so this must be the auth user id, not the member row id.
// The signed URLs and the audit write run concurrently, so the wait is the
// slowest single call rather than the sum of all four.
async function signUrl(path) {
  if (!path) return null;
  const { data: signed, error } = await supabase.storage
    .from(ID_DOCUMENT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) {
    // Degrade gracefully (the profile/member payload still returns, just
    // missing this one photo) rather than failing the whole request — but
    // log loudly, since silently returning null here previously made a
    // signing failure indistinguishable from "no photo was ever uploaded".
    console.error(`[identity] createSignedUrl failed for "${path}" in bucket "${ID_DOCUMENT_BUCKET}":`, error.message ?? error);
    return null;
  }
  return signed?.signedUrl ?? null;
}

async function getMember(id, actorAuthId) {
  const [{ data, error }, sub] = await Promise.all([
    supabase.from('members').select('*').eq('id', id).single(),
    latestSubmission(id),
  ]);
  if (error) throw error;
  const member = withSubmission(data, sub);

  const [, id_document_signed_url, id_document_back_signed_url, selfie_signed_url] = await Promise.all([
    actorAuthId ? writeAudit(actorAuthId, 'account.id_viewed', id, null) : Promise.resolve(),
    signUrl(member.id_document_url),
    signUrl(member.id_document_back_url),
    signUrl(member.selfie_url),
  ]);

  return { ...member, id_document_signed_url, id_document_back_signed_url, selfie_signed_url };
}

// Records a sysadmin decision on the submission in review. Returns the
// updated member, or null when the member isn't pending.
// `reviewerId` is the admin's members.id (identity_submissions.reviewed_by);
// `actorAuthId` is their auth.users.id (system_audit_log) — two id spaces.
async function decide({ memberId, reviewerId, status, reason }) {
  const now = new Date().toISOString();
  const memberUpdate = { verification_status: status };
  if (status === 'verified') memberUpdate.verified_at = now;
  const { data, error } = await supabase
    .from('members')
    .update(memberUpdate)
    .eq('id', memberId)
    .eq('verification_status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { error: subErr } = await supabase
    .from('identity_submissions')
    .update({ status, reason: reason ?? null, reviewed_by: reviewerId, reviewed_at: now })
    .eq('member_id', memberId)
    .eq('status', 'pending');
  if (subErr) throw subErr;
  return getMember(memberId);
}

async function approveMember({ memberId, reviewerId, actorAuthId }) {
  const member = await decide({ memberId, reviewerId, status: 'verified' });
  if (member) {
    await writeAudit(actorAuthId, 'account.verified', memberId, { before: 'pending', after: 'verified' });
    await notify({
      memberId,
      type: 'identity.verified',
      title: 'Account verified',
      message: 'Your identity has been verified. You can now create groups, request loans, and be appointed an officer.',
    });
  }
  return member;
}

// Sysadmin asks the member to fix something and submit again (blurry photo,
// wrong ID type…). The reason is shown to the member.
async function requestResubmission({ memberId, reviewerId, actorAuthId, reason }) {
  const member = await decide({ memberId, reviewerId, status: 'resubmission_required', reason });
  if (member) {
    await writeAudit(actorAuthId, 'account.resubmission_requested', memberId, { reason });
    await notify({
      memberId,
      type: 'identity.resubmission_required',
      title: 'Please resubmit your ID',
      message: `Your ID needs to be submitted again: ${reason}`,
    });
  }
  return member;
}

// Sysadmin rejects a member — final, they can't resubmit. The reason is kept
// on the submission (so the member can see it) and on the audit row.
async function rejectMember({ memberId, reviewerId, actorAuthId, reason }) {
  const member = await decide({ memberId, reviewerId, status: 'rejected', reason });
  if (member) {
    await writeAudit(actorAuthId, 'account.rejected', memberId, { reason: reason ?? null });
    await notify({
      memberId,
      type: 'identity.rejected',
      title: 'Verification rejected',
      message: reason ? `Your ID verification was rejected: ${reason}` : 'Your ID verification was rejected.',
    });
  }
  return member;
}

// The current member's own profile + status
async function getMyProfile(memberId) {
  return getMember(memberId);
}

module.exports = {
  submitDocument, updateProfile, listForReview, getMember,
  approveMember, rejectMember, getMyProfile,
};
