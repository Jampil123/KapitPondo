import { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';
import { formatPH, toE164PH } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { recordCurrentLogin } from '@/lib/loginActivity';

const OTP_VALIDITY_SECONDS = 5 * 60;

export default function Otp() {
  const { phone, purpose } = useLocalSearchParams<{ phone?: string; purpose?: 'reset' }>();
  const isReset = purpose === 'reset';
  const { confirmOtp, resendOtp, setPendingRedirect } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(OTP_VALIDITY_SECONDS);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const pretty = phone ? formatPH(phone) : 'your number';
  const expired = resendIn <= 0;
  const resendLabel = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;

  async function onVerify() {
    if (code.length < 6 || !phone || expired) return;
    setLoading(true);
    try {
      setPendingRedirect(isReset ? '/(app)/reset-password' : '/(app)/verify-landing');
      await confirmOtp(phone, code);
      recordCurrentLogin();
    } catch (e) {
      Alert.alert('Verification failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (!phone) return;
    try {
      if (isReset) {
        // A reset code is a login OTP, not a signup confirmation — resend() can't reissue it.
        const e164 = toE164PH(phone);
        if (!e164) throw new Error('Enter a valid Philippine mobile number.');
        const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { shouldCreateUser: false } });
        if (error) throw error;
      } else {
        await resendOtp(phone);
      }
      setCode('');
      setResendIn(OTP_VALIDITY_SECONDS);
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
        <Button label="Verify" onPress={onVerify} loading={loading} disabled={code.length < 6 || expired} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 20 }}>
          <Text variant="body" color="secondary">Didn't get the code?</Text>
          {resendIn > 0 ? (
            <Text variant="body" color="muted">
              Resend in {resendLabel}
            </Text>
          ) : (
            <Text variant="label" color="brand" onPress={onResend}>Resend Code</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
