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
  verification_status: VerificationStatus;
  id_document_url: string | null;
  id_type: string | null;
  selfie_url: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  birthday: string | null;
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

export interface SubmitIdentityInput {
  id_document_url: string;
  full_name?: string;
  phone?: string;
  id_type?: string;
  selfie_url?: string;
  email?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
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

/**
 * POST /api/me/identity — submit or resubmit an ID document.
 * Only valid when status is `unverified` or `rejected`; sets status to `pending`.
 */
export async function submitIdentity(input: SubmitIdentityInput) {
  const res = await api.post<{ message: string; member: Member }>('/api/me/identity', input);
  return res.member;
}