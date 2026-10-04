/**
 * components/chat/MessageBubble.tsx
 * ----------------------------------------------------------------------------
 * One chat message. Own messages: right-aligned, brand-colored, no avatar.
 * Others': left-aligned, avatar + name, surface-colored. A message with
 * image_url (see 0049_chat_media.sql) renders the photo above its body text
 * — body is often empty for a photo-only message, so it's only shown when
 * there's a caption.
 */
import { View, Image } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Image as AnimatedImage } from 'expo-image';
import { semantic } from '@/theme/colors';
import { isStickerUrl } from '@/api/stickers';

/** The shape any message needs to render as a bubble — both ChatMessage
 *  (api/messages.ts) and DirectMessage (api/directMessages.ts) satisfy this
 *  structurally, so the same bubble renders group chat and 1:1 DMs. */
export interface BubbleMessage {
  sender_name: string;
  body: string;
  image_url: string | null;
  created_at: string;
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

/** True when `message` starts a new day relative to the message before it
 *  (`older` — the next item in an inverted, newest-first list). */
export function startsNewDay(message: BubbleMessage, older?: BubbleMessage) {
  return !older || dayKey(older.created_at) !== dayKey(message.created_at);
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/** Centered "Today" / "Yesterday" / date pill between days. */
export function DayDivider({ iso }: { iso: string }) {
  return (
    <View style={{ alignSelf: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3, marginVertical: 8 }}>
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{dayLabel(iso)}</Text>
    </View>
  );
}

export function MessageBubble({ message, isOwn, avatarUrl }: { message: BubbleMessage; isOwn: boolean; avatarUrl?: string | null }) {
  const sticker = isStickerUrl(message.image_url) && !message.body;
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <View style={{ flexDirection: 'row', justifyContent: isOwn ? 'flex-end' : 'flex-start', gap: 8, maxWidth: '100%' }}>
      {!isOwn && <Avatar name={message.sender_name} uri={avatarUrl} size={32} />}
      <View style={{ maxWidth: '75%' }}>
        {!isOwn && (
          <Text variant="caption" color="secondary" style={{ marginBottom: 2, marginLeft: 4 }}>
            {message.sender_name}
          </Text>
        )}
        {sticker ? (
          <AnimatedImage
            source={{ uri: message.image_url! }}
            style={{ width: 130, height: 130, alignSelf: isOwn ? 'flex-end' : 'flex-start' }}
            contentFit="contain"
          />
        ) : (
        <View
          style={{
            backgroundColor: isOwn ? semantic.brand : semantic.surfaceAlt,
            borderRadius: 20,
            borderBottomRightRadius: isOwn ? 6 : 20,
            borderBottomLeftRadius: isOwn ? 20 : 6,
            overflow: 'hidden',
            paddingHorizontal: message.image_url ? 4 : 14,
            paddingVertical: message.image_url ? 4 : 10,
          }}
        >
          {message.image_url ? (
            <Image
              source={{ uri: message.image_url }}
              style={{ width: 200, height: 200, borderRadius: 12 }}
              resizeMode="cover"
            />
          ) : null}
          {message.body ? (
            <Text style={{ color: isOwn ? semantic.textOnBrand : semantic.textPrimary, margin: message.image_url ? 6 : 0 }}>
              {message.body}
            </Text>
          ) : null}
        </View>
        )}
        <Text variant="caption" color="muted" style={{ fontSize: 11, marginTop: 3, textAlign: isOwn ? 'right' : 'left', marginHorizontal: 6 }}>
          {time}
        </Text>
      </View>
    </View>
  );
}
