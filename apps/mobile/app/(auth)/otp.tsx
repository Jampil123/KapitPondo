/**
 * app/(auth)/otp.tsx  — "Verify your number" (prototype screen 3).
 * Confirms the phone with the SMS code. Reads ?phone= from the route.
 */
import { useEffect, useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';
import { formatPH } from '@/lib/phone';
import { useAuth } from '@/context/AuthContext';

export default function Otp() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { confirmOtp, resendOtp } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(30);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const pretty = phone ? formatPH(phone) : 'your number';

  async function onVerify() {
    if (code.length < 6 || !phone) return;
    setLoading(true);
    try {
      await confirmOtp(phone, code);
      router.replace('/(app)/verify-landing' as any); // verify-now / do-it-later fork
    } catch (e) {
      Alert.alert('Verification failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (!phone) return;
    try {
      await resendOtp(phone);
      setResendIn(30);
    } catch (e) {
      Alert.alert('Could not resend', (e as Error).message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 }}>
        <View style={{ alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 26 }}>
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 18,
              backgroundColor: semantic.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Mail size={30} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 21, marginTop: 4 }}>Verify your number</Text>
          <Text variant="body" color="secondary">We sent a 6-digit code to</Text>
          <Text variant="label">{pretty}</Text>
        </View>

        <OtpInput value={code} onChange={setCode} />

        <View style={{ height: 28 }} />
        <Button label="Verify" onPress={onVerify} loading={loading} disabled={code.length < 6} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 20 }}>
          <Text variant="body" color="secondary">Didn't get the code?</Text>
          {resendIn > 0 ? (
            <Text variant="body" color="muted">
              Resend in 0:{String(resendIn).padStart(2, '0')}
            </Text>
          ) : (
            <Text variant="label" color="brand" onPress={onResend}>Resend Code</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
