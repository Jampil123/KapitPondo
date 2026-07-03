/**
 * components/shared/AppBar.tsx
 * ----------------------------------------------------------------------------
 * Back header with a left-aligned title + optional subtitle + optional right
 * node (matches the designer's AppBar). Used by group sub-screens.
 */
import { ReactNode } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic } from '../../theme/colors';

export function AppBar({
  title,
  subtitle,
  back = true,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        height: 56,
        backgroundColor: semantic.surface,
        borderBottomWidth: 1,
        borderBottomColor: semantic.border,
      }}
    >
      {back ? (
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={semantic.textPrimary} />
        </Pressable>
      ) : (
        <View style={{ width: 12 }} />
      )}
      <View style={{ flex: 1 }}>
        <Text variant="h3" style={{ fontSize: 16 }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" color="secondary">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
