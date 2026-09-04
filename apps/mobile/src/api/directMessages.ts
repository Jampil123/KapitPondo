/**
 * api/directMessages.ts
 * ----------------------------------------------------------------------------
 * 1:1 messages between two active members of the same group — backs
 * "Contact an officer" and "Members" on the Messages screen. Any two active
 * members of a group can message each other (an officer is just a member
 * with a role), unlike the shared 'officers'/'general' rooms in api/messages.ts.
 */
import { api } from './client';

export interface DirectMessage {
  id: string;
  group_id: string;
  sender_id: string;
  recipient_id: string;
  sender_name: string;
  body: string;
  image_url: string | null;
  created_at: string;
}

/** GET /api/groups/:groupId/direct-messages/:otherMemberId — newest-first page, optional `before` cursor. */
export async function listDirectMessages(
  groupId: string,
  otherMemberId: string,
  opts: { limit?: number; before?: string } = {},
) {
  const res = await api.get<{ messages: DirectMessage[] }>(`/api/groups/${groupId}/direct-messages/${otherMemberId}`, {
    limit: opts.limit,
    before: opts.before,
  });
  return res.messages ?? [];
}

/** POST /api/groups/:groupId/direct-messages — the realtime INSERT event, not this response, is what appends to the UI. */
export function sendDirectMessage(groupId: string, recipientId: string, body: string, imageUrl?: string | null) {
  return api.post<{ message: DirectMessage }>(`/api/groups/${groupId}/direct-messages`, {
    recipient_id: recipientId,
    body,
    image_url: imageUrl ?? undefined,
  });
}
