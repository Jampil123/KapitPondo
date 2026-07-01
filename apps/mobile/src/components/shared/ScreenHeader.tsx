/**
 * components/shared/ScreenHeader.tsx
 * ----------------------------------------------------------------------------
 * The prototype's header: optional back chevron, centered (or left) logo +
 * "KapitPondo" wordmark. LogoMark is the accent rounded-square peso badge.
 */
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic, shadowToken } from '../../theme/colors';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: semantic.brand,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadowToken.button,
      ]}
    >
      {/* simple peso glyph; swap for an SVG/icon later if desired */}
      <Text style={{ color: '#fff', fontSize: size * 0.5, fontWeight: '700' }}>₱</Text>
    </View>
  );
}

export function ScreenHeader({ back = false }: { back?: boolean }) {
  const router = useRouter();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 12,
        minHeight: 52,
      }}
    >
      <View style={{ width: 30, alignItems: 'flex-start' }}>
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ marginLeft: -4 }}>
            <ChevronLeft size={24} color={semantic.textPrimary} />
          </Pressable>
        ) : null}
      </View>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          justifyContent: back ? 'flex-start' : 'center',
        }}
      >
        <LogoMark size={28} />
        <Text variant="h3" style={{ fontSize: 17, letterSpacing: -0.2 }}>
          KapitPondo
        </Text>
      </View>
      <View style={{ width: 30 }} />
    </View>
  );
}
