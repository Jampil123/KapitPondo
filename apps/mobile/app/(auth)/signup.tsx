import { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { User, Phone, Lock, ShieldCheck, Mail, Calendar, Info, ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { semantic } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';

const PREFIX = '+63 ';

function formatPhone(raw: string): string {
  if (!raw.startsWith('+63')) return PREFIX;
  const digits = raw.replace(/^\+63\s?/, '').replace(/\D/g, '').slice(0, 10);
  let body = '';
  if (digits.length <= 3) body = digits;
  else if (digits.length <= 6) body = `${digits.slice(0, 3)} ${digits.slice(3)}`;
  else body = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return PREFIX + body;
}

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(PREFIX);
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = firstName.trim() && lastName.trim() && phone.trim() && password.length >= 8 && agreed;

  async function onCreate() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await signUp({
        phone,
        password,
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim(),
        birthday: birthday.trim() || undefined,
        email: email.trim() || undefined,
        consentAccepted: agreed,
      });
      router.push({ pathname: '/(auth)/otp', params: { phone } });
    } catch (e) {
      Alert.alert('Sign up failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, alignSelf: 'flex-start' }}
      >
        <ChevronLeft size={26} color={semantic.textPrimary} />
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 }}>
        <View style={{ gap: 3, marginTop: 10, marginBottom: 22 }}>
          <Text variant="h1" style={{ fontSize: 23 }}>Create your account</Text>
          <Text variant="body" color="secondary">Join your community sinking fund in minutes.</Text>
        </View>

        <Field
          label="First Name"
          placeholder="Juan"
          value={firstName}
          onChangeText={setFirstName}
          leading={<User size={18} color={semantic.textMuted} />}
        />
        <Field
          label="Middle Name"
          placeholder="Santos (optional)"
          value={middleName}
          onChangeText={setMiddleName}
          leading={<User size={18} color={semantic.textMuted} />}
        />
        <Field
          label="Last Name"
          placeholder="Dela Cruz"
          value={lastName}
          onChangeText={setLastName}
          leading={<User size={18} color={semantic.textMuted} />}
        />
        <Field
          label="Birthday"
          placeholder="MM/DD/YYYY (optional)"
          value={birthday}
          onChangeText={setBirthday}
          keyboardType="numbers-and-punctuation"
          leading={<Calendar size={18} color={semantic.textMuted} />}
        />
        <Field
          label="Email"
          placeholder="juan@email.com (optional)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          leading={<Mail size={18} color={semantic.textMuted} />}
        />

        <View
          style={{
            flexDirection: 'row',
            gap: 9,
            alignItems: 'flex-start',
            backgroundColor: semantic.surfaceAlt,
            borderRadius: 12,
            paddingVertical: 11,
            paddingHorizontal: 14,
            marginTop: 2,
            marginBottom: 14,
          }}
        >
          <Info size={16} color={semantic.brandDark} style={{ marginTop: 1 }} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
            Middle name, birthday, and email are optional — you can add or update them later during identity verification.
          </Text>
        </View>

        <Field
          label="Phone Number"
          placeholder="+63 900 000 0000"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(t) => setPhone(formatPhone(t))}
          leading={<Phone size={18} color={semantic.textMuted} />}
        />
        <PasswordField
          label="Password"
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          leading={<Lock size={18} color={semantic.textMuted} />}
        />

        <View
          style={{
            flexDirection: 'row',
            gap: 9,
            alignItems: 'center',
            backgroundColor: semantic.surfaceAlt,
            borderRadius: 12,
            paddingVertical: 11,
            paddingHorizontal: 14,
            marginTop: 2,
            marginBottom: 18,
          }}
        >
          <ShieldCheck size={18} color={semantic.brandDark} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
            Your details are encrypted and never shared.
          </Text>
        </View>

        <View style={{ marginBottom: 18 }}>
          <Checkbox
            checked={agreed}
            onToggle={() => setAgreed((a) => !a)}
            label="I agree to KapitPondo's Terms of Service and Privacy Policy."
          />
        </View>

        <Button label="Create Account" onPress={onCreate} loading={loading} disabled={!canSubmit} />

        
      </ScrollView>
    </SafeAreaView>
  );
}
