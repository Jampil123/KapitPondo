/**
 * api/ai.ts
 * ----------------------------------------------------------------------------
 * KapitBot — the member support/FAQ chatbot (services/api/src/modules/ai).
 * Stateless: the caller resends the recent turns as `history` each request,
 * same shape the backend expects (see gemini.js's chatWithMember).
 */
import { api } from './client';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function sendChatMessage(groupId: string, message: string, history: ChatTurn[] = []) {
  return api.post<{ reply: string }>(`/api/groups/${groupId}/ai/chat`, { message, history });
}
