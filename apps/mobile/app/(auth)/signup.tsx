import { useState } from 'react';
import { View, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { User, Phone, Lock, Mail, ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { PasswordRules, passwordMeetsRules } from '@/components/ui/PasswordRules';
import { PrivacyPolicyModal } from '@/components/shared/PrivacyPolicyModal';
import { DateField, parseIsoDate } from '@/components/shared/DateInput';
import { semantic } from '@/theme/colors';
import { useAuth, PhoneAlreadyRegisteredError } from '@/context/AuthContext';

const PREFIX = '+63 ';

const MIN_SIGNUP_AGE = 18;

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

const MAX_BIRTHDAY = new Date();
const DEFAULT_BIRTHDAY = new Date(2000, 0, 1);

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
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(PREFIX);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ firstName: false, lastName: false, birthday: false });
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  const isBlank = (v: string) => v.trim().length === 0;
  const phoneDigits = phone.replace(/^\+63\s?/, '').replace(/\D/g, '');
  const parsedBirthday = parseIsoDate(birthday);

  const firstNameValid = !isBlank(firstName);
  const lastNameValid = !isBlank(lastName);
  const birthdayValid = !!parsedBirthday && calculateAge(parsedBirthday) >= MIN_SIGNUP_AGE;
  const phoneValid = phoneDigits.length === 10;
  const emailValid = isBlank(email) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = passwordMeetsRules(password);

  const firstNameError = touched.firstName && !firstNameValid ? 'First name is required.' : undefined;
  const lastNameError = touched.lastName && !lastNameValid ? 'Last name is required.' : undefined;
  const birthdayError = touched.birthday
    ? !parsedBirthday
      ? 'Please select a valid birthdate.'
      : calculateAge(parsedBirthday) < MIN_SIGNUP_AGE
        ? `You must be at least ${MIN_SIGNUP_AGE} years old to sign up.`
        : undefined
    : undefined;
  const phoneError = phoneTaken ? 'This number is already registered. Sign in instead.' : undefined;

  const canSubmit =
    firstNameValid &&
    lastNameValid &&
    birthdayValid &&
    phoneValid &&
    !phoneTaken &&
    emailValid &&
    passwordValid &&
    agreed;

  async function onCreate() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await signUp({
        phone,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthday: birthday.trim(),
        email: email.trim() || undefined,
        consentAccepted: agreed,
      });
      router.push({ pathname: '/(auth)/otp', params: { phone } });
    } catch (e) {
      if (e instanceof PhoneAlreadyRegisteredError) setPhoneTaken(true);
      else Alert.alert('Sign up failed', (e as Error).message);
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginTop: 10, marginBottom: 22 }}>
            <Text variant="h1" style={{ fontSize: 23 }}>Create your account</Text>
          </View>

          <Field
            label="First Name"
            placeholder="Juan"
            value={firstName}
            onChangeText={setFirstName}
            onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
            error={firstNameError}
            leading={<User size={18} color={semantic.textMuted} />}
          />
          <Field
            label="Last Name"
            placeholder="Dela Cruz"
            value={lastName}
            onChangeText={setLastName}
            onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
            error={lastNameError}
            leading={<User size={18} color={semantic.textMuted} />}
          />
          <DateField maximumDate={MAX_BIRTHDAY} defaultDate={DEFAULT_BIRTHDAY}
            label="Birthday"
            value={birthday}
            onChange={(iso) => { setBirthday(iso); setTouched((t) => ({ ...t, birthday: true })); }}
            error={birthdayError}
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

          <Field
            label="Phone Number"
            placeholder="+63 900 000 0000"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(t) => { setPhone(formatPhone(t)); setPhoneTaken(false); }}
            error={phoneError}
            leading={<Phone size={18} color={semantic.textMuted} />}
          />
          <PasswordField
            label="Password"
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            leading={<Lock size={18} color={semantic.textMuted} />}
          />
          <PasswordRules password={password} visible={passwordFocused || password.length > 0} />

          <View style={{ marginBottom: 18 }}>
            <Checkbox
              checked={agreed}
              onToggle={() => setAgreed((a) => !a)}
              label={
                <Text variant="bodySmall" color="secondary">
                  I agree to KapitPondo's Terms of Service and{' '}
                  <Text
                    variant="bodySmall"
                    color="brand"
                    onPress={() => setShowPrivacyPolicy(true)}
                    style={{ textDecorationLine: 'underline' }}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              }
            />
          </View>

          <Button label="Create Account" onPress={onCreate} loading={loading} disabled={!canSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PrivacyPolicyModal visible={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} />
    </SafeAreaView>
  );
}
