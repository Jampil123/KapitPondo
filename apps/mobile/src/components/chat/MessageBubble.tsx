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
import { semantic, shadowToken } from '@/theme/colors';

/** The shape any message needs to render as a bubble — both ChatMessage
 *  (api/messages.ts) and DirectMessage (api/directMessages.ts) satisfy this
 *  structurally, so the same bubble renders group chat and 1:1 DMs. */
export interface BubbleMessage {
  sender_name: string;
  body: string;
  image_url: string | null;
  created_at: string;
}

export function MessageBubble({ message, isOwn }: { message: BubbleMessage; isOwn: boolean }) {
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={{ flexDirection: 'row', justifyContent: isOwn ? 'flex-end' : 'flex-start', gap: 8, maxWidth: '100%' }}>
      {!isOwn && <Avatar name={message.sender_name} size={32} />}
      <View style={{ maxWidth: '75%' }}>
        {!isOwn && (
          <Text variant="caption" color="secondary" style={{ marginBottom: 2, marginLeft: 4 }}>
            {message.sender_name}
          </Text>
        )}
        <View
          style={[
            {
              backgroundColor: isOwn ? semantic.brand : semantic.surface,
              borderRadius: 16,
              borderBottomRightRadius: isOwn ? 4 : 16,
              borderBottomLeftRadius: isOwn ? 16 : 4,
              overflow: 'hidden',
              padding: message.image_url ? 4 : undefined,
              paddingHorizontal: message.image_url ? 4 : 12,
              paddingVertical: message.image_url ? 4 : 8,
            },
            shadowToken.card,
          ]}
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
        <Text variant="caption" color="muted" style={{ marginTop: 2, textAlign: isOwn ? 'right' : 'left', marginHorizontal: 4 }}>
          {time}
        </Text>
      </View>
    </View>
  );
}
