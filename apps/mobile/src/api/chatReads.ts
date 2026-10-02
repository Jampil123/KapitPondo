import { api } from './client';

/** 'general' | 'officers' | 'announcements' | `dm:${otherMemberId}` */
export type ChatConversation = string;

export interface ChatReads {
  /** When the caller last opened each conversation. */
  mine: Record<ChatConversation, string>;
  /** Per other member: when they last opened their DM with the caller. */
  theirs: Record<string, string>;
}

export interface RoomReader {
  member_id: string;
  full_name: string | null;
  avatar_url: string | null;
  last_read_at: string;
}

export function getChatReads(groupId: string) {
  return api.get<ChatReads>(`/api/groups/${groupId}/chat-reads`);
}

export function markChatRead(groupId: string, conversation: ChatConversation) {
  return api.put<{ read: { conversation: string; last_read_at: string } }>(
    `/api/groups/${groupId}/chat-reads/${encodeURIComponent(conversation)}`,
  );
}

/** Everyone else's last-read time on a shared room ('general' | 'officers'). */
export async function listRoomReaders(groupId: string, room: 'general' | 'officers') {
  const res = await api.get<{ readers: RoomReader[] }>(`/api/groups/${groupId}/chat-reads/${room}/readers`);
  return res.readers;
}
