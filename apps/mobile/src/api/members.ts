/**
 * api/members.ts
 * ----------------------------------------------------------------------------
 * Calls the identity module of the API (M1). Screens import these, never the
 * raw endpoints.
 *
 * NOTE: the Member type should ultimately come from packages/shared. It's
 * declared locally here only so this file type-checks standalone; replace with
 * `import type { Member } from '@/types'` once the shared package is wired.
 */
import { api } from './client';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface Member {
  id: string;
  auth_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_system_admin: boolean;
  avatar_url: string | null;
  verification_status: VerificationStatus;
  verification_rejection_reason: string | null;
  id_document_url: string | null;
  id_document_back_url: string | null;
  id_document_qr_data: string | null;
  id_type: string | null;
  selfie_url: string | null;
  /** Short-lived signed URLs — present on GET /api/me/profile (and the admin
   *  equivalent), absent from list endpoints that only select a few columns. */
  id_document_signed_url?: string | null;
  id_document_back_signed_url?: string | null;
  selfie_signed_url?: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  birthday: string | null;
  sex: string | null;
  id_number: string | null;
  nationality: string | null;
  region: string | null;
  province: string | null;
  city: string | null;
  barangay: string | null;
  street_address: string | null;
  zip_code: string | null;
  source_of_funds: string | null;
  employment_status: string | null;
  occupation: string | null;
  created_at: string;
}

/** GET /api/me/profile — the signed-in member + verification status. */
export async function getMyProfile() {
  const res = await api.get<{ member: Member }>('/api/me/profile');
  return res.member;
}

export interface UpdateProfileInput {
  avatar_url?: string;
  full_name?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  birthday?: string;
  nationality?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  street_address?: string;
  zip_code?: string;
  source_of_funds?: string;
  employment_status?: string;
  occupation?: string;
}

/** PATCH /api/me/profile — update my own personal info (not the KYC document/status). */
export async function updateProfile(input: UpdateProfileInput) {
  const res = await api.patch<{ message: string; member: Member }>('/api/me/profile', input);
  return res.member;
}

export interface SubmitIdentityInput {
  id_document_url: string;
  id_document_back_url?: string;
  id_document_qr_data?: string;
  full_name?: string;
  phone?: string;
  id_type?: string;
  selfie_url?: string;
  email?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  birthday?: string;
  sex?: string;
  id_number?: string;
  nationality?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  street_address?: string;
  zip_code?: string;
  source_of_funds?: string;
  employment_status?: string;
  occupation?: string;
}

/**
 * POST /api/me/identity — submit or resubmit an ID document.
 * Only valid when status is `unverified` or `rejected`; sets status to `pending`.
 */
export async function submitIdentity(input: SubmitIdentityInput) {
  const res = await api.post<{ message: string; member: Member }>('/api/me/identity', input);
  return res.member;
}

export interface IdFieldsSuggestion {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  birthday: string | null;
  sex: string | null;
  id_number: string | null;
  nationality: string | null;
  province: string | null;
  city: string | null;
  barangay: string | null;
  street_address: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

/**
 * POST /api/me/identity/extract-fields — reads the ID photo (not yet
 * uploaded) and suggests personal-info field values for step 3 of the
 * identity wizard. A draft only — the member still reviews/edits everything
 * before submitIdentity() is called; this never verifies identity itself.
 */
export async function extractIdFields(imageBase64: string, mediaType: string) {
  // A full-resolution camera photo (not a small screenshot) takes Gemini's
  // vision call noticeably longer than the client's normal 10s default —
  // give it real room before the request gets aborted client-side.
  const res = await api.post<{ fields: IdFieldsSuggestion }>(
    '/api/me/identity/extract-fields',
    { image_base64: imageBase64, media_type: mediaType },
    { timeoutMs: 30_000 },
  );
  return res.fields;
}