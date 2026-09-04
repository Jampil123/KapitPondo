/**
 * app/(app)/[groupId]/dm/[memberId].tsx — 1:1 conversation with another
 * active member of this group (an officer or a plain member — same screen,
 * see directMessages.routes.js: any two active members can message each
 * other). Reached by tapping a row under "Contact an officer"/"Members" on
 * messages.tsx. Mirrors chat/[channel].tsx's composer (sticker tray, photo
 * picker, gradient send button) — a DM is just a different message source.
 */
import { useState } from 'react';
import { View, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Send, MessageCircle, Image as ImageIcon, Smile } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { LoadingState } from '@/components/shared/LoadingState';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { semantic } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { usePresentMembers } from '@/context/PresenceContext';
import { useQuery } from '@/hooks/useApi';
import { listMemberDirectory } from '@/api/groups';
import { uploadChatImage } from '@/lib/upload';
import { useDirectMessages, useSendDirectMessage } from '@/features/chat/directMessages.hooks';

const GRADIENT = ['#6CC5FF', '#2FA8FF', '#0F7FE0'] as const;
const STICKERS = ['👍', '😊', '🎉', '🙏', '❤️', '😂', '✅', '💰'];

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

export default function DirectMessage() {
  const { groupId, memberId } = useLocalSearchParams<{ groupId: string; memberId: string }>();
  const { member } = useAuth();
  const present = usePresentMembers();
  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const other = directory.data?.find((m) => m.member_id === memberId);
  const isOnline = present.some((p) => p.member_id === memberId);

  const [draft, setDraft] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const { messages, loading, loadingMore, loadMore } = useDirectMessages(groupId, memberId, member?.id);
  const { send, sending } = useSendDirectMessage(groupId!, memberId!);

  async function onSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await send(body); // realtime echo appends it — see directMessages.hooks.ts
  }

  async function onSendSticker(emoji: string) {
    setShowStickers(false);
    await send(emoji);
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: semantic.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <AppBar title={title} subtitle={subtitle} />

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
                renderItem={({ item }) => <MessageBubble message={item} isOwn={item.sender_id === member?.id} />}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={loadingMore ? <LoadingState fullscreen={false} /> : null}
                contentContainerStyle={{ padding: 12, gap: 6 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              />
            )}
          </View>
        </TouchableWithoutFeedback>

        {showStickers ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
            style={{ borderTopWidth: 1, borderColor: semantic.border, backgroundColor: semantic.surface }}
          >
            {STICKERS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onSendSticker(emoji)}
                style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: showStickers ? 0 : 1, borderColor: semantic.border, backgroundColor: semantic.surface }}>
          <Pressable onPress={onPickImage} disabled={uploadingImage} hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            {uploadingImage ? <ActivityIndicator size="small" color={semantic.brandDark} /> : <ImageIcon size={23} color={semantic.brandDark} strokeWidth={1.8} />}
          </Pressable>

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            multiline
            onFocus={() => setShowStickers(false)}
            style={{ flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: semantic.surfaceAlt, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, color: semantic.textPrimary }}
          />

          {draft.trim() ? (
            <Pressable onPress={onSend} disabled={sending}>
              <LinearGradient
                colors={GRADIENT}
                locations={[0, 0.55, 1]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={{
                  width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                  opacity: sending ? 0.5 : 1,
                  shadowColor: '#2FA8FF', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 6,
                }}
              >
                <Send size={18} color="#fff" strokeWidth={2.3} />
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { Keyboard.dismiss(); setShowStickers((s) => !s); }}
              style={{
                width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                backgroundColor: showStickers ? semantic.dashCard : semantic.surfaceAlt,
              }}
            >
              <Smile size={20} color={showStickers ? '#fff' : semantic.brandDark} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
