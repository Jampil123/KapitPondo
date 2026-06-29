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
  created_at: string;
}

/** GET /api/me/profile — the signed-in member + verification status. */
export function getMyProfile() {
  return api.get<Member>('/api/me/profile');
}

export interface SubmitIdentityInput {
  id_document_url: string;
  full_name?: string;
  phone?: string;
}

/**
 * POST /api/me/identity — submit or resubmit an ID document.
 * Only valid when status is `unverified` or `rejected`; sets status to `pending`.
 */
export function submitIdentity(input: SubmitIdentityInput) {
  return api.post<Member>('/api/me/identity', input);
}