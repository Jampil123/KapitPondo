/**
 * app/(auth)/pending.tsx — "Verification in Progress" (prototype screen 7).
 * Shown after submitting an ID. "Got It" continues into the app on a Basic
 * account; verification completes asynchronously (Sysadmin reviews on web).
 */
import { useEffect, useRef } from 'react';
import { Platform, View, ScrollView, Animated, Easing } from 'react-native';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Clock, Mail, HelpCircle, Shield } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic, shadowToken } from '@/theme/colors';

function Spinner() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER }),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
      <View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: semantic.borderStrong }} />
      <Animated.View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: 'transparent', borderTopColor: semantic.brand, borderRightColor: semantic.brand, transform: [{ rotate }] }} />
      <View style={[{ width: 64, height: 64, borderRadius: 20, backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center' }, shadowToken.button]}>
        <Clock size={34} color="#fff" strokeWidth={2} />
      </View>
    </View>
  );
}

export default function Pending() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 }}>
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <Spinner />
          <Text variant="h1" style={{ fontSize: 22, textAlign: 'center' }}>Verification in Progress</Text>
          <Text variant="bodySmall" color="secondary" style={{ textAlign: 'center', marginTop: 10, maxWidth: 300 }}>
            We're currently reviewing your submitted information to ensure the security of the KapitPondo community.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8EFDA', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, marginTop: 18 }}>
            <Clock size={16} color="#A87C2C" />
            <Text variant="caption" style={{ color: '#A87C2C', fontWeight: '600' }}>Usually completed within 24 hours</Text>
          </View>
        </View>

        <View style={[{ flexDirection: 'row', gap: 12, backgroundColor: semantic.surface, borderRadius: 18, padding: 15, marginTop: 24 }, shadowToken.card]}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={22} color={semantic.brandDark} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">We'll notify you</Text>
            <Text variant="caption" color="secondary">By email and in-app notification once your account has been verified.</Text>
          </View>
        </View>

        <View style={{ flex: 1, minHeight: 10 }} />
        <Button label="Got It" onPress={() => router.replace('/(app)/groups')} />
        <View style={{ alignItems: 'center', marginTop: 13 }}>
          <Text variant="label" color="brand" onPress={() => router.replace('/(app)/groups')}>Back to Home</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18, marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <HelpCircle size={15} color={semantic.textSecondary} />
            <Text variant="caption" color="secondary">Need Help?</Text>
          </View>
          <View style={{ width: 1, height: 12, backgroundColor: semantic.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Shield size={15} color={semantic.textSecondary} />
            <Text variant="caption" color="secondary">Privacy Policy</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
