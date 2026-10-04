import { useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Alert } from '@/lib/alert';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { LoadingState } from '@/components/shared/LoadingState';
import { MessageBubble, DayDivider, startsNewDay } from '@/components/chat/MessageBubble';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatSheet, CHAT_SHEET_OVERLAP } from '@/components/chat/ChatSheet';
import { semantic, steel, intent } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { usePresentMembers } from '@/context/PresenceContext';
import { useMemberDirectory } from '@/features/chat/chatCache';
import { uploadChatImage } from '@/lib/upload';
import { useDirectMessages, useSendDirectMessage } from '@/features/chat/directMessages.hooks';
import { useMarkChatSeen, useChatReads, hasSeen } from '@/features/chat/chatSeen';
import { SeenReceipt } from '@/components/chat/SeenReceipt';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

export default function DirectMessage() {
  const { groupId, memberId } = useLocalSearchParams<{ groupId: string; memberId: string }>();
  const { member } = useAuth();
  const present = usePresentMembers();
  const directory = useMemberDirectory(groupId);
  const other = directory.data?.find((m) => m.member_id === memberId);
  const isOnline = present.some((p) => p.member_id === memberId);

  const [uploadingImage, setUploadingImage] = useState(false);

  const { messages, loading, loadingMore, loadMore } = useDirectMessages(groupId, memberId, member?.id);
  const { send, sending } = useSendDirectMessage(groupId!, memberId!);
  useMarkChatSeen(groupId, memberId ? `dm:${memberId}` : undefined, messages[0]?.id);
  const reads = useChatReads(groupId);
  const newest = messages[0];
  const newestMine = !!newest && newest.sender_id === member?.id;
  const newestSeen = newestMine && hasSeen(reads.data?.theirs[memberId!], newest.created_at);

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
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 });
    if (res.canceled) return;
    setUploadingImage(true);
    try {
      const imageUrl = await uploadChatImage(groupId!, res.assets[0].uri);
      await send('', imageUrl);
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploadingImage(false);
    }
  }

  const title = other?.full_name ?? 'Member';
  const subtitle = other ? `${ROLE_LABEL[other.role] ?? other.role}${isOnline ? ' · Active now' : ''}` : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: steel[200] }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <BandHeader
        title={title}
        subtitle={subtitle}
        leading={
          <View>
            <Avatar name={title} uri={other?.avatar_url} size={38} />
            {isOnline ? (
              <View style={{ position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: intent.success.base, borderWidth: 2, borderColor: '#fff' }} />
            ) : null}
          </View>
        }
        bottomPadding={CHAT_SHEET_OVERLAP + 6} />
      <ChatSheet>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {loading ? (
              <LoadingState label="Loading messages…" />
            ) : messages.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
                <MessageCircle size={40} color={semantic.textMuted} />
                <Text variant="h3" style={{ fontSize: 16 }}>No messages yet</Text>
                <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  Say hello to {other?.full_name ?? 'them'}.
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
                ListHeaderComponent={newestMine ? <SeenReceipt label={newestSeen ? 'Seen' : 'Sent'} seen={newestSeen} alignRight /> : null}
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
