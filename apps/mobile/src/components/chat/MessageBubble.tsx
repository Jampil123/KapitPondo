/**
 * components/chat/MessageBubble.tsx
 * ----------------------------------------------------------------------------
 * One chat message. Own messages: right-aligned, brand-colored, no avatar.
 * Others': left-aligned, avatar + name, surface-colored.
 */
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { semantic, shadowToken } from '@/theme/colors';
import type { ChatMessage } from '@/api/messages';

export function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
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
              paddingHorizontal: 12,
              paddingVertical: 8,
            },
            shadowToken.card,
          ]}
        >
          <Text style={{ color: isOwn ? semantic.textOnBrand : semantic.textPrimary }}>{message.body}</Text>
        </View>
        <Text variant="caption" color="muted" style={{ marginTop: 2, textAlign: isOwn ? 'right' : 'left', marginHorizontal: 4 }}>
          {time}
        </Text>
      </View>
    </View>
  );
}
