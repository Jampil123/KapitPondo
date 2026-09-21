import { useState } from 'react';
import { View, ScrollView, Alert, TextInput, Modal, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { User, Phone, Lock, Mail, Calendar, ChevronLeft } from 'lucide-react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Text } from '@/components/ui/Text';
import { Field, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { PrivacyPolicyModal } from '@/components/shared/PrivacyPolicyModal';
import { semantic, intent } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';

const PREFIX = '+63 ';

function parseIsoDate(value: string): Date | null {
  if (!value.trim()) return null;
  const d = new Date(`${value.trim()}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDisplayDate(value: string): string {
  const d = parseIsoDate(value);
  return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : value;
}

const MIN_SIGNUP_AGE = 18;

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

const MAX_BIRTHDAY = new Date();

function BirthdayField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const current = parseIsoDate(value) ?? new Date(2000, 0, 1);

  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 7, marginBottom: 15 }}>
        <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={semantic.textMuted}
          style={{
            backgroundColor: semantic.surfaceAlt,
            borderRadius: 12,
            paddingHorizontal: 14,
            height: 48,
            color: semantic.textPrimary,
            borderWidth: error ? 1.5 : 0,
            borderColor: error ? intent.danger.base : undefined,
          }}
        />
        {error ? (
          <Text variant="caption" style={{ color: intent.danger.text }}>{error}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 6, marginBottom: 15 }}>
      <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
      <Pressable
        onPress={() => setShow(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          backgroundColor: semantic.surfaceAlt,
          borderRadius: 12,
          paddingVertical: 13,
          paddingHorizontal: 14,
          borderWidth: error ? 1.5 : 0,
          borderColor: error ? intent.danger.base : undefined,
        }}
      >
        <Text variant="body" style={{ color: value ? semantic.textPrimary : semantic.textMuted }}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
        <Calendar size={18} color={semantic.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" style={{ color: intent.danger.text }}>{error}</Text>
      ) : null}

      {show && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          value={current}
          maximumDate={MAX_BIRTHDAY}
          onValueChange={(_e, date) => { onChange(toIsoDate(date)); setShow(false); }}
          onDismiss={() => setShow(false)}
          style={{ position: 'absolute', width: 0, height: 0 }}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={() => setShow(false)}>
            <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
              <Text variant="h3" style={{ fontSize: 17 }}>{label}</Text>
              <DateTimePicker
                mode="date"
                display="inline"
                value={current}
                maximumDate={MAX_BIRTHDAY}
                onValueChange={(_e, date) => onChange(toIsoDate(date))}
              />
              <Button label="Done" onPress={() => setShow(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
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

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(PREFIX);
  const [password, setPassword] = useState('');
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
  const passwordValid = password.length >= 8;

  const firstNameError = touched.firstName && !firstNameValid ? 'First name is required.' : undefined;
  const lastNameError = touched.lastName && !lastNameValid ? 'Last name is required.' : undefined;
  const birthdayError = touched.birthday
    ? !parsedBirthday
      ? 'Please select a valid birthdate.'
      : calculateAge(parsedBirthday) < MIN_SIGNUP_AGE
        ? `You must be at least ${MIN_SIGNUP_AGE} years old to sign up.`
        : undefined
    : undefined;

  const canSubmit =
    firstNameValid &&
    lastNameValid &&
    birthdayValid &&
    phoneValid &&
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
          <BirthdayField
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
