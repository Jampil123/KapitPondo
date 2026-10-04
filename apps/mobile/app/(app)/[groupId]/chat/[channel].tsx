import { useEffect, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Alert } from '@/lib/alert';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { LoadingState } from '@/components/shared/LoadingState';
import { MessageBubble, DayDivider, startsNewDay } from '@/components/chat/MessageBubble';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatSheet, CHAT_SHEET_OVERLAP } from '@/components/chat/ChatSheet';
import { semantic, steel } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { usePresentMembers } from '@/context/PresenceContext';
import { can } from '@/constants/roles';
import { useMemberDirectory } from '@/features/chat/chatCache';
import { uploadChatImage } from '@/lib/upload';
import { useMessages, useSendMessage } from '@/features/chat/chat.hooks';
import { useMarkChatSeen, useRoomReaders, seenBy, seenByLabel } from '@/features/chat/chatSeen';
import { SeenReceipt } from '@/components/chat/SeenReceipt';
import type { ChatChannel } from '@/api/messages';

/** "Ana is active now" / "5 active now" / "No one else is active right now" —
 *  driven by real Supabase Realtime presence (PresenceContext), not a guess. */
function activeNowLabel(others: { full_name: string | null }[]): string {
  if (others.length === 0) return 'No one else is active right now';
  if (others.length === 1) return `${others[0].full_name ?? 'Someone'} is active now`;
  return `${others.length} active now`;
}

export default function Chat() {
  const { groupId, channel } = useLocalSearchParams<{ groupId: string; channel: ChatChannel }>();
  const { role, group } = useActiveGroup();
  const { member } = useAuth();
  const [uploadingImage, setUploadingImage] = useState(false);
  const directory = useMemberDirectory(groupId);
  const present = usePresentMembers();

  // Access guard: a plain member deep-linking to /chat/officers gets bounced.
  // Mirrors the backend's 403 (constants/roles.ts's convention: UI must follow
  // the same guard the API enforces so nothing renders that the API would
  // then reject).
  const allowed = channel === 'officers' ? can(role, 'viewOfficersChat') : can(role, 'viewGeneralChat');
  useEffect(() => {
    if (role && !allowed) router.back();
  }, [role, allowed]);

  const { messages, loading, loadingMore, loadMore } = useMessages(groupId, channel, member?.id);
  const { send, sending } = useSendMessage(groupId, channel);
  useMarkChatSeen(groupId, allowed ? channel : undefined, messages[0]?.id);
  const readers = useRoomReaders(groupId, channel, !!role && allowed);
  const newest = messages[0];
  const newestSeenBy = newest ? seenBy(readers.data ?? [], newest, member?.id) : [];
  const receipt = newest
    ? (seenByLabel(newestSeenBy) ?? (newest.sender_id === member?.id ? 'Sent' : null))
    : null;

  if (!role || !allowed) return null; // brief flash before the redirect above fires

  async function onSend(body: string) {
    await send(body); // realtime echo appends it
  }

  async function onSendSticker(url: string) {
    await send('', url);
  }

  async function onPickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to share a picture here.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (res.canceled) return;
    setUploadingImage(true);
    try {
      const imageUrl = await uploadChatImage(groupId!, res.assets[0].uri);
      await send('', imageUrl); // realtime echo appends it — see chat.hooks.ts
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploadingImage(false);
    }
  }

  const title = channel === 'officers' ? 'Officers room' : (group?.name ?? 'Group chat');
  const othersPresent = present.filter((p) => p.member_id !== member?.id);
  const subtitle = channel === 'officers' ? undefined : activeNowLabel(othersPresent);

  return (
    // KeyboardAvoidingView wraps everything (including the header band) so its
    // 'padding' behavior measures from the true screen edge — no manual
    // keyboardVerticalOffset needed (matches groups/create.tsx, join.tsx).
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: steel[200] }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <BandHeader title={title} subtitle={subtitle} leading={<Avatar name={title} size={38} />} bottomPadding={CHAT_SHEET_OVERLAP + 6} />
      <ChatSheet>
        {/* Full-page chat body: the role nav bar is hidden on this route
            (see [groupId]/_layout.tsx), so this is the whole screen below
            the header band. Tapping anywhere in it (outside the composer's own
            controls) dismisses the keyboard. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {loading ? (
              <LoadingState label="Loading messages…" />
            ) : messages.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
                <MessageCircle size={40} color={semantic.textMuted} />
                <Text variant="h3" style={{ fontSize: 16 }}>No messages yet</Text>
                <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  Be the first to say something here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={messages}
                inverted
                keyExtractor={(m) => m.id}
                renderItem={({ item, index }) => (
                  <View>
                    {startsNewDay(item, messages[index + 1]) ? <DayDivider iso={item.created_at} /> : null}
                    <MessageBubble message={item} isOwn={item.sender_id === member?.id} avatarUrl={directory.data?.find((d) => d.member_id === item.sender_id)?.avatar_url} />
                  </View>
                )}
                // Inverted list: the header renders below the newest message.
                ListHeaderComponent={receipt && newest ? (
                  <SeenReceipt label={receipt} seen={newestSeenBy.length > 0} alignRight={newest.sender_id === member?.id} />
                ) : null}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={loadingMore ? <LoadingState fullscreen={false} /> : null}
                contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 6 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              />
            )}
          </View>
        </TouchableWithoutFeedback>

        <ChatComposer onSend={onSend} onPickImage={onPickImage} onSendSticker={onSendSticker} sending={sending} uploadingImage={uploadingImage} />
      </ChatSheet>
    </KeyboardAvoidingView>
  );
}
