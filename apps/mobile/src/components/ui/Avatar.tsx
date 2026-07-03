/**
 * components/ui/Avatar.tsx
 * ----------------------------------------------------------------------------
 * Initials avatar with a deterministic background color (mirrors the designer's
 * avatarColor). Reused across member lists.
 */
import { View } from 'react-native';
import { Text } from './Text';

const PALETTE = ['#7FA6B8', '#8AA98C', '#B89A7F', '#9489B5', '#B5818F', '#7FB6AC', '#A6906B'];

export function avatarColor(name: string): string {
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return PALETTE[sum % PALETTE.length];
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

export function Avatar({ name, size = 44, square = false }: { name?: string | null; size?: number; square?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: square ? size * 0.3 : size / 2,
        backgroundColor: avatarColor(name ?? '?'),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
