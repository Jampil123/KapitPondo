import { useState } from 'react';
import { View, TextInput, Pressable, Keyboard, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { Plus, Send, Smile } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { stickersEnabled } from '@/api/stickers';
import { StickerPicker } from './StickerPicker';

const STICKERS = ['👍', '😊', '🎉', '🙏', '❤️', '😂', '✅', '💰'];

export function ChatComposer({
  onSend,
  onPickImage,
  onSendSticker,
  sending,
  uploadingImage,
}: {
  onSend: (body: string) => Promise<unknown> | void;
  onPickImage: () => void;
  /** Sends a picked GIPHY sticker as the message image. */
  onSendSticker: (url: string) => Promise<unknown> | void;
  sending: boolean;
  uploadingImage: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const hasText = !!draft.trim();

  function sendDraft() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    onSend(body);
  }

  return (
    <View style={{ backgroundColor: semantic.surface, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, gap: 8 }}>
      {showStickers && stickersEnabled ? (
        <StickerPicker onPick={(url) => { setShowStickers(false); onSendSticker(url); }} />
      ) : showStickers ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }} keyboardShouldPersistTaps="handled">
          {STICKERS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => { setShowStickers(false); onSend(emoji); }}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View
        style={[
          { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, minHeight: 48, borderRadius: 24, backgroundColor: semantic.surface, borderWidth: 1, borderColor: semantic.border },
          shadowToken.soft,
        ]}
      >
        <Pressable
          onPress={onPickImage}
          disabled={uploadingImage}
          hitSlop={6}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center' }}
        >
          {uploadingImage ? <ActivityIndicator size="small" color="#fff" /> : <Plus size={20} color="#fff" strokeWidth={2.4} />}
        </Pressable>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor={semantic.textMuted}
          multiline
          // Web renders multiline as a <textarea>, which defaults to two rows and makes the bar too tall.
          {...(Platform.OS === 'web' ? { rows: 1 } : null)}
          textAlignVertical="center"
          onFocus={() => setShowStickers(false)}
          style={[
            { flex: 1, minHeight: 36, maxHeight: 120, paddingHorizontal: 4, paddingVertical: 8, color: semantic.textPrimary },
            Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as object) : null,
          ]}
        />

        {hasText ? (
          <Pressable
            onPress={sendDraft}
            disabled={sending}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.5 : 1 }}
          >
            <Send size={16} color="#fff" strokeWidth={2.3} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { Keyboard.dismiss(); setShowStickers((s) => !s); }}
            hitSlop={6}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Smile size={22} color={showStickers ? semantic.brandDark : semantic.textMuted} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
