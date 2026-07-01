/**
 * app/(auth)/forgot.tsx — "Reset Password" (prototype screen 6).
 * Sends an OTP to the registered number, then routes to the OTP screen.
 *
 * NOTE: this sends a sign-in OTP (passwordless) so the user can regain access;
 * after verifying, prompt them to set a new password in Settings. A dedicated
 * reset-password screen is a sensible follow-up.
 */
import { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Phone, Lock, Shield } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';
import { toE164PH } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function Forgot() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSend() {
    const e164 = toE164PH(phone);
    if (!e164) {
      Alert.alert('Invalid number', 'Enter a valid Philippine mobile number.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
      if (error) throw error;
      router.push({ pathname: '/(auth)/otp', params: { phone } });
    } catch (e) {
      Alert.alert('Could not send code', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 }}>
        <View style={{ alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 26 }}>
          <View style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={30} color={semantic.brandDark} />
          </View>
          <View style={{ alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Text variant="h1" style={{ fontSize: 21 }}>Reset Password</Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center', maxWidth: 280 }}>
              Enter your registered mobile number to receive a verification code.
            </Text>
          </View>
        </View>

        <Field
          label="Mobile Number"
          placeholder="+63 900 000 0000"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          leading={<Phone size={18} color={semantic.textMuted} />}
        />
        <View style={{ height: 6 }} />
        <Button label="Send Code" onPress={onSend} loading={loading} disabled={!phone.trim()} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 18 }}>
          <Text variant="body" color="secondary">Remembered your password?</Text>
          <Text variant="label" color="brand" onPress={() => router.replace('/(auth)/signin')}>Log In</Text>
        </View>

        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }}>
          <Shield size={15} color={semantic.textMuted} />
          <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            Your information is protected using secure encryption.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
