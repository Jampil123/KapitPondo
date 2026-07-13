/**
 * app/(app)/[groupId]/chat/[channel].tsx — group chat (officers or general).
 * Reached from GroupSheetNav's Chat sheet via route 'chat/officers' | 'chat/general'.
 */
import { useEffect, useState } from 'react';
import { View, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Send, MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { LoadingState } from '@/components/shared/LoadingState';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { semantic } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { can } from '@/constants/roles';
import { useMessages, useSendMessage } from '@/features/chat/chat.hooks';
import type { ChatChannel } from '@/api/messages';

export default function Chat() {
  const { groupId, channel } = useLocalSearchParams<{ groupId: string; channel: ChatChannel }>();
  const { role } = useActiveGroup();
  const { member } = useAuth();
  const [draft, setDraft] = useState('');

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

  const title = channel === 'officers' ? 'Officers room' : 'Group feed';

  return (
    // KeyboardAvoidingView wraps everything (including the AppBar) so its
    // 'padding' behavior measures from the true screen edge — no manual
    // keyboardVerticalOffset needed (matches groups/create.tsx, join.tsx).
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: semantic.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <AppBar title={title} />

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
                  <MessageBubble message={item} isOwn={item.sender_id === member?.id} />
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

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderColor: semantic.border, backgroundColor: semantic.surface }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            multiline
            style={{ flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: semantic.surfaceAlt, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, color: semantic.textPrimary }}
          />
          <Pressable onPress={onSend} disabled={sending || !draft.trim()} style={{ opacity: sending || !draft.trim() ? 0.5 : 1, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Send size={22} color={semantic.brandDark} />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
