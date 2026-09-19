import { useEffect, useState } from 'react';
import { View, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Send, MessageCircle, Image as ImageIcon, Smile } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { LoadingState } from '@/components/shared/LoadingState';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { semantic } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { usePresentMembers } from '@/context/PresenceContext';
import { can } from '@/constants/roles';
import { useQuery } from '@/hooks/useApi';
import { listOfficers, listMemberDirectory } from '@/api/groups';
import { uploadChatImage } from '@/lib/upload';
import { useMessages, useSendMessage } from '@/features/chat/chat.hooks';
import type { ChatChannel } from '@/api/messages';

const GRADIENT = ['#6CC5FF', '#2FA8FF', '#0F7FE0'] as const;
const STICKERS = ['👍', '😊', '🎉', '🙏', '❤️', '😂', '✅', '💰'];

/** "Ana, Jay, Marites +13 more" — a name list that degrades gracefully once
 *  a group has more members than fit in an AppBar subtitle line. */
function nameList(names: (string | null)[], max = 3): string {
  const clean = names.map((n) => n ?? 'Unnamed');
  if (clean.length === 0) return '';
  const shown = clean.slice(0, max).join(', ');
  const rest = clean.length - max;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

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
  const [draft, setDraft] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);
  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const present = usePresentMembers();

  // Access guard: a plain member deep-linking to /chat/officers gets bounced.
  // Mirrors the backend's 403 (constants/roles.ts's convention: UI must follow
  // the same guard the API enforces so nothing renders that the API would
  // then reject).
  const allowed = channel === 'officers' ? can(role, 'viewOfficersChat') : can(role, 'viewGeneralChat');
  useEffect(() => {
    if (role && !allowed) router.back();
  }, [role, allowed]);

  const { messages, loading, loadingMore, loadMore } = useMessages(groupId, channel);
  const { send, sending } = useSendMessage(groupId, channel);

  if (!role || !allowed) return null; // brief flash before the redirect above fires

  async function onSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await send(body); // realtime echo appends it — see chat.hooks.ts
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
  const subtitle = channel === 'officers'
    ? (officers.data ? `${nameList(officers.data.officers.map((o) => o.full_name))} · private` : undefined)
    : activeNowLabel(othersPresent);

  return (
    // KeyboardAvoidingView wraps everything (including the AppBar) so its
    // 'padding' behavior measures from the true screen edge — no manual
    // keyboardVerticalOffset needed (matches groups/create.tsx, join.tsx).
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: semantic.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <AppBar title={title} subtitle={subtitle} />

        {/* Full-page chat body: the role nav bar is hidden on this route
            (see [groupId]/_layout.tsx), so this is the whole screen below
            the AppBar. Tapping anywhere in it (outside the composer's own
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
                renderItem={({ item }) => (
                  <MessageBubble message={item} isOwn={item.sender_id === member?.id} avatarUrl={directory.data?.find((d) => d.member_id === item.sender_id)?.avatar_url} />
                )}
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
          <Pressable
            onPress={onPickImage}
            disabled={uploadingImage}
            hitSlop={6}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
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
