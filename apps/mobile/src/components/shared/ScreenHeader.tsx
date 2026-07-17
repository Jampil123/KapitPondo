/**
 * components/shared/ScreenHeader.tsx
 * ----------------------------------------------------------------------------
 * The prototype's header: optional back chevron, centered (or left) logo +
 * "KapitPondo" wordmark. LogoMark renders the KP brand logo image.
 */
import { View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic } from '../../theme/colors';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require('../../../assets/images/KP-Logo.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}

/** The "KapitPondo" wordmark — "Kapit" in black, "Pondo" in the brand's dark blue. */
export function Wordmark({ fontSize = 17 }: { fontSize?: number }) {
  return (
    <Text variant="h3" style={{ fontSize, letterSpacing: -0.2 }}>
      <Text variant="h3" color="inherit" style={{ fontSize, color: '#000000' }}>Kapit</Text>
      <Text variant="h3" color="inherit" style={{ fontSize, color: semantic.brandDark }}>Pondo</Text>
    </Text>
  );
}

export function ScreenHeader({ back = false, showBrand = true }: { back?: boolean; showBrand?: boolean }) {
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
        {showBrand ? (
          <>
            <LogoMark size={28} />
            <Wordmark fontSize={17} />
          </>
        ) : null}
      </View>
      <View style={{ width: 30 }} />
    </View>
  );
}
