/**
 * api/messages.ts
 * ----------------------------------------------------------------------------
 * Group chat (two channels: 'officers', 'general'). Text-only in v1.
 */
import { api } from './client';

export type ChatChannel = 'officers' | 'general';

export interface ChatMessage {
  id: string;
  group_id: string;
  channel: ChatChannel;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
}

/** GET /api/groups/:groupId/messages — newest-first page, optional `before` cursor. */
export async function listMessages(
  groupId: string,
  channel: ChatChannel,
  opts: { limit?: number; before?: string } = {},
) {
  const res = await api.get<{ messages: ChatMessage[] }>(`/api/groups/${groupId}/messages`, {
    channel,
    limit: opts.limit,
    before: opts.before,
  });
  return res.messages ?? [];
}

/** POST /api/groups/:groupId/messages — the realtime INSERT event, not this response, is what appends to the UI. */
export function sendMessage(groupId: string, channel: ChatChannel, body: string) {
  return api.post<{ message: ChatMessage }>(`/api/groups/${groupId}/messages`, { channel, body });
}
