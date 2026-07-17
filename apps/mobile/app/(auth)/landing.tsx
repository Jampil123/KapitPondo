import { useEffect, useRef } from 'react';
import { View, Animated, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';

const BG        = '#0C1318';
const CARD_BG   = '#162028';
const CARD_LINE = '#7FA6B840';  // brand at 25%
const GLOW      = '#7FA6B8';

const NATIVE_DRIVER = Platform.OS !== 'web';

export default function LandingScreen() {
  const router = useRouter();
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -12, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(float, { toValue: 0,   duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
      ])
    ).start();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, paddingHorizontal: 22, justifyContent: 'space-between', paddingVertical: 32 }}>

        {/* Brand header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 8 }}>
          <LogoMark size={34} />
          <Text variant="h1" style={{ fontSize: 22, letterSpacing: -0.5 }}>
            <Text variant="h1" color="inherit" style={{ fontSize: 22, color: '#B8CCD4' }}>Kapit</Text>
            <Text variant="h1" color="inherit" style={{ fontSize: 22, color: semantic.brand }}>Pondo</Text>
          </Text>
        </View>

        {/* Hero */}
        <View style={{ alignItems: 'center' }}>
          {/* Outer glow ring */}
          <View style={{
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: 160,
            backgroundColor: GLOW + '12',
          }} />
          {/* Inner glow ring — tighter, brighter */}
          <View style={{
            position: 'absolute',
            width: 210,
            height: 210,
            borderRadius: 105,
            backgroundColor: GLOW + '1A',
          }} />

          <Animated.View
            style={{
              transform: [{ translateY: float }],
              width: 288,
              height: 172,
              backgroundColor: CARD_BG,
              borderRadius: 22,
              padding: 22,
              justifyContent: 'space-between',
              borderWidth: 1.5,
              borderColor: CARD_LINE,
              marginBottom: 44,
              // glow border effect
              shadowColor: GLOW,
              shadowOpacity: 0.45,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 0 },
              elevation: 12,
              ...(Platform.OS === 'web' && { boxShadow: `0 0 32px ${GLOW}55` }),
            }}
          >
            {/* Mock card chip */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{
                width: 44,
                height: 34,
                backgroundColor: semantic.brand + '28',
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: semantic.brand + '50',
              }}>
                <View style={{ width: 28, height: 18, backgroundColor: semantic.brand, borderRadius: 4, opacity: 0.9 }} />
              </View>
              <View style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: semantic.brand + '22',
                borderWidth: 1,
                borderColor: semantic.brand + '40',
              }} />
            </View>

            {/* Mock amount lines */}
            <View style={{ gap: 8 }}>
              <View style={{ height: 8, width: 104, backgroundColor: '#FFFFFF18', borderRadius: 4 }} />
              <View style={{ height: 8, width: 68,  backgroundColor: '#FFFFFF10', borderRadius: 4 }} />
            </View>
          </Animated.View>

          {/* Headline */}
          <Text variant="h1" style={{ textAlign: 'center', fontSize: 26, lineHeight: 34, paddingHorizontal: 4, color: '#D6E4EA' }}>
            Grow your community wealth with{' '}
            <Text variant="h1" style={{ color: '#B8CCD4', fontSize: 26 }}>Kapit</Text>
            <Text variant="h1" style={{ color: semantic.brand, fontSize: 26 }}>Pondo</Text>
          </Text>
          <Text variant="body" style={{ textAlign: 'center', marginTop: 12, paddingHorizontal: 16, color: '#7FA6B8CC' }}>
            A secure platform for shared savings and community-driven financial growth.
          </Text>
        </View>

        {/* Actions */}
        <View style={{ gap: 12 }}>
          {/* Primary button — wrap in glow layer */}
          <View style={{
            borderRadius: 13,
            shadowColor: GLOW,
            shadowOpacity: 0.55,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
            ...(Platform.OS === 'web' && { boxShadow: `0 6px 28px ${GLOW}88` }),
          }}>
            <Button label="Start an account" onPress={() => router.push('/(auth)/signup')} />
          </View>

          <Button
            label="Log In"
            variant="ghost"
            onPress={() => router.push('/(auth)/signin')}
            style={{ borderColor: semantic.brand + '60' }}
          />

          <Text
            variant="caption"
            style={{ textAlign: 'center', marginTop: 4, paddingHorizontal: 12, lineHeight: 18, color: '#7FA6B870' }}
          >
            KapitPondo helps cooperatives record and manage shared funds transparently.
            {'\n'}By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}
