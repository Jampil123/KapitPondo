import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Phone, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ScreenHeader, LogoMark, Wordmark } from '@/components/shared/ScreenHeader';
import { semantic, intent } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { recordCurrentLogin } from '@/lib/loginActivity';
import { toE164PH } from '@/lib/phone';

const PREFIX = '+63 ';

// Plain-language version of the sign-in errors Supabase and the network give.
function signInMessage(e: unknown): string {
  const msg = (e as Error)?.message ?? '';
  if (/invalid login credentials/i.test(msg)) return 'Incorrect phone number or password.';
  // Supabase's error for an auth ban, which backs an admin suspension.
  if (/banned/i.test(msg)) return 'This account is suspended. Contact support for help.';
  if (/not confirmed/i.test(msg)) return "This number isn't verified yet. Sign up again to get a new code.";
  if (/network|fetch|timed? ?out/i.test(msg)) return "Can't reach the server. Check your connection and try again.";
  return msg || 'Sign in failed. Please try again.';
}

function formatPhone(raw: string): string {
  if (!raw.startsWith('+63')) return PREFIX;
  const digits = raw.replace(/^\+63\s?/, '').replace(/\D/g, '').slice(0, 10);
  let body = '';
  if (digits.length <= 3) body = digits;
  else if (digits.length <= 6) body = `${digits.slice(0, 3)} ${digits.slice(3)}`;
  else body = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return PREFIX + body;
}

export default function SignIn() {
  const router = useRouter();
  const { signInWithPassword } = useAuth();
  const [phone, setPhone] = useState(PREFIX);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; password?: string; form?: string }>({});

  async function onSignIn() {
    const next = {
      phone: toE164PH(phone) ? undefined : 'Enter a valid mobile number, e.g. +63 917 123 4567.',
      password: password ? undefined : 'Enter your password.',
    };
    setErrors(next);
    if (next.phone || next.password) return;
    setLoading(true);
    try {
      await signInWithPassword(phone, password);
      recordCurrentLogin();
      router.replace('/(app)/groups' as any);
    } catch (e) {
      setErrors({ form: signInMessage(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back showBrand={false} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 }}>
        <View style={{ gap: 6, marginTop: 10, marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LogoMark size={32} />
            <Wordmark fontSize={20} />
          </View>
        </View>

        <Field
          label="Phone Number"
          placeholder="+63 900 000 0000"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(t) => { setPhone(formatPhone(t)); setErrors((x) => ({ ...x, phone: undefined, form: undefined })); }}
          error={errors.phone}
          leading={<Phone size={18} color={semantic.textMuted} />}
        />
        <PasswordField
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={(t) => { setPassword(t); setErrors((x) => ({ ...x, password: undefined, form: undefined })); }}
          error={errors.password}
          leading={<Lock size={18} color={semantic.textMuted} />}
        />

        <View style={{ alignItems: 'flex-end', marginTop: -4, marginBottom: 20 }}>
          <Text variant="body" color="brand" onPress={() => router.push('/(auth)/forgot')}>
            Forgot Password?
          </Text>
        </View>

        {errors.form ? (
          <View style={{ backgroundColor: intent.danger.soft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 }}>
            <Text variant="caption" style={{ color: intent.danger.text }}>{errors.form}</Text>
          </View>
        ) : null}

        <Button label="Sign In" onPress={onSignIn} loading={loading} />
      </ScrollView>
    </SafeAreaView>
  );
}
