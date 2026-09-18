import { api } from './client';

export type FeedbackCategory = 'bug' | 'feature' | 'general' | 'other';

export async function sendFeedback(input: {
  category: FeedbackCategory;
  message: string;
  app_version?: string;
  platform?: string;
}): Promise<void> {
  await api.post('/api/me/feedback', input);
}
