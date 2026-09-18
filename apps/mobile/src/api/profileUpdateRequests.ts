import { api } from './client';

export type ProfileUpdateField =
  | 'first_name' | 'middle_name' | 'last_name' | 'birthday' | 'nationality'
  | 'region' | 'province' | 'city' | 'barangay' | 'street_address' | 'zip_code'
  | 'source_of_funds' | 'employment_status' | 'occupation';

export type ProfileUpdateReason = 'typo' | 'legal_name_change' | 'other';

export interface ProfileUpdateRequest {
  id: string;
  field: ProfileUpdateField;
  current_value: string | null;
  new_value: string;
  reason: ProfileUpdateReason;
  details: string | null;
  proof_url: string | null;
  requires_reverification: boolean;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export async function submitProfileUpdateRequest(input: {
  field: ProfileUpdateField;
  current_value: string | null;
  new_value: string;
  reason: ProfileUpdateReason;
  details?: string;
  proof_url?: string;
}): Promise<ProfileUpdateRequest> {
  const res = await api.post<{ request: ProfileUpdateRequest }>('/api/me/profile-update-requests', input);
  return res.request;
}

export async function listMyProfileUpdateRequests(): Promise<ProfileUpdateRequest[]> {
  const res = await api.get<{ requests: ProfileUpdateRequest[] }>('/api/me/profile-update-requests');
  return res.requests;
}
