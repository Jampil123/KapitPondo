/**
 * app/(app)/[groupId]/chatbot.tsx — KapitBot, the member support/FAQ
 * chatbot (see services/api/src/modules/ai/ai.routes.js + integrations/ai/
 * gemini.js). Stateless: this screen keeps the transcript in local state and
 * resends the recent turns as `history` on every message — there's no
 * server-side chat storage.
 *
 * KapitBot has no access to any member's real account data and never states
 * a number as if it were a real balance (see gemini.js's CHAT_SYSTEM) — the
 * suggested prompts below are deliberately scoped to what it CAN answer
 * (how the app/paluwagan model works), not account-specific questions.
 */
import { useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Bot, Sparkles, Send, MoreVertical } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useAction } from '@/hooks/useApi';
import { sendChatMessage, type ChatTurn } from '@/api/ai';

const GRADIENT = [semantic.brand, semantic.dashCard] as const;

const GREETING = "Hi! I'm KapitBot 👋 Ask me anything about how contributions, loans, or KapitPondo's approval process work.";

const SUGGESTIONS = [
  'How do contributions work?',
  'How do I request a loan?',
  'What is segregation of duties?',
  "Who are my group's officers?",
];

interface Message extends ChatTurn {
  id: string;
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <View style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser ? (
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: semantic.dashCard, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2 }}>
          <Bot size={15} color="#fff" />
        </View>
      ) : null}
      <View
        style={[
          {
            maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
            backgroundColor: isUser ? semantic.brand : semantic.surface,
            borderBottomRightRadius: isUser ? 4 : 16,
            borderBottomLeftRadius: isUser ? 16 : 4,
          },
          shadowToken.card,
        ]}
      >
        <Text style={{ color: isUser ? semantic.textOnBrand : semantic.textPrimary, fontSize: 13.5, lineHeight: 19 }}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: semantic.dashCard, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
        <Bot size={15} color="#fff" />
      </View>
      <View style={[{ paddingHorizontal: 16, paddingVertical: 13, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: semantic.surface, flexDirection: 'row', gap: 4 }, shadowToken.card]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.textMuted, opacity: 0.4 + i * 0.2 }} />
        ))}
      </View>
    </View>
  );
}

export default function Chatbot() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Message[]>([{ id: 'greeting', role: 'assistant', content: GREETING }]);
  const [draft, setDraft] = useState('');
  const chat = useAction((message: string, history: ChatTurn[]) => sendChatMessage(groupId!, message, history));

  function scrollToEnd() {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  async function onSend(text?: string) {
    const body = (text ?? draft).trim();
    if (!body || chat.loading) return;
    setDraft('');
    const history: ChatTurn[] = messages
      .filter((m) => m.id !== 'greeting')
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: body }]);
    scrollToEnd();

    const res = await chat.run(body, history);
    if (res) {
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: res.reply }]);
    } else {
      setMessages((prev) => [...prev, {
        id: `e-${Date.now()}`, role: 'assistant',
        content: chat.error?.status === 501
          ? "KapitBot isn't set up yet — ask your group's Owner to configure it."
          : "Sorry, I couldn't reach the server just now. Try again in a moment.",
      }]);
    }
    scrollToEnd();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: semantic.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: semantic.border, backgroundColor: semantic.surface }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={semantic.textPrimary} />
          </Pressable>
          <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={22} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>KapitBot</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: semantic.dashCard, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                <Sparkles size={9} color="#fff" />
                <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: 0.3 }}>AI</Text>
              </View>
            </View>
            <Text variant="caption" style={{ color: intent.success.text, marginTop: 2, fontWeight: '600' }}>Online · Always available</Text>
          </View>
          <MoreVertical size={20} color={semantic.textMuted} />
        </View>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
          >
            <View style={{ alignSelf: 'center', maxWidth: '92%', backgroundColor: intent.warning.soft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 4 }}>
              <Text style={{ fontSize: 10.5, lineHeight: 15, color: intent.warning.text, textAlign: 'center', fontWeight: '600' }}>
                KapitBot is an AI assistant for guidance only — it can't see your account data or process any transactions.
              </Text>
            </View>

            {messages.map((m) => <Bubble key={m.id} message={m} />)}

            {messages.length === 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4, marginLeft: 36 }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => onSend(s)}
                    style={{ backgroundColor: semantic.surface, borderWidth: 1, borderColor: semantic.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 13 }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {chat.loading ? <TypingBubble /> : null}
          </ScrollView>
        </TouchableWithoutFeedback>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderColor: semantic.border, backgroundColor: semantic.surface }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask KapitBot…"
            multiline
            style={{ flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: semantic.surfaceAlt, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, color: semantic.textPrimary }}
          />
          <Pressable onPress={() => onSend()} disabled={chat.loading || !draft.trim()} style={{ opacity: chat.loading || !draft.trim() ? 0.5 : 1 }}>
            <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}>
              <Send size={18} color="#fff" strokeWidth={2.3} />
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
