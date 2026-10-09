import { api } from './client';

export type ProblemCategory =
  | 'account_information' | 'identity_verification' | 'technical'
  | 'group_activity' | 'account_concern' | 'other';

/** POST /me/problem-reports — filed to the System Administrator, who can refer it to the group's officers. */
export function fileProblemReport(input: { category: ProblemCategory; subject: string; description: string; group_id?: string }) {
  return api.post<{ report: { id: string } }>('/api/me/problem-reports', input);
}

export type ProblemStatus = 'new' | 'under_review' | 'investigating' | 'resolved' | 'closed';

export type MyProblemReport = {
  id: string;
  category: string;
  subject: string;
  description: string;
  status: ProblemStatus;
  resolution: string | null;
  resolution_note: string | null;
  group_name: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /me/problem-reports — everything I've filed, newest first. */
export async function listMyProblemReports() {
  return (await api.get<{ reports: MyProblemReport[] }>('/api/me/problem-reports')).reports;
}

/** GET /me/problem-reports/categories — the active categories (managed by the System Administrator). */
export async function listProblemCategories() {
  return (await api.get<{ categories: { key: ProblemCategory; label: string }[] }>('/api/me/problem-reports/categories')).categories;
}
