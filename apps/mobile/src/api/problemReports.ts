import { api } from './client';

export type ProblemCategory =
  | 'account_information' | 'identity_verification' | 'technical'
  | 'group_activity' | 'account_concern' | 'other';

/** POST /me/problem-reports — filed to the System Administrator, who can refer it to the group's officers. */
export function fileProblemReport(input: { category: ProblemCategory; subject: string; description: string; group_id?: string }) {
  return api.post<{ report: { id: string } }>('/api/me/problem-reports', input);
}
