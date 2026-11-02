import { useEffect, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone, Check, CheckCircle2, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Field, PasswordField } from '@/components/ui/Field';
import { OtpInput } from '@/components/ui/OtpInput';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { supabase } from '@/lib/supabase';
import { formatPH, toE164PH, phoneFormatError, isSmsSendError, SMS_SEND_FAILED } from '@/lib/phone';
import { syncPhone } from '@/api/members';
import { useAuth } from '@/context/AuthContext';

const BAND_TOP = '#4C7C90';
const PREFIX = '+63 ';
const RESEND_SECONDS = 2 * 60;

// Change flow: confirm password → new number → SMS code to the new number → done.
type Stage = 'view' | 'password' | 'number' | 'verify' | 'done';

/** "+63 917 123 4567" as the member types — same as sign-up. */
function formatPhoneInput(raw: string): string {
  if (!raw.startsWith('+63')) return PREFIX;
  const digits = raw.replace(/^\+63\s?/, '').replace(/\D/g, '').slice(0, 10);
  let body = '';
  if (digits.length <= 3) body = digits;
  else if (digits.length <= 6) body = `${digits.slice(0, 3)} ${digits.slice(3)}`;
  else body = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return PREFIX + body;
}

export default function MobileNumber() {
  const { member, signInWithPassword, refreshMember } = useAuth();
  const [stage, setStage] = useState<Stage>('view');
  const currentPhone = member?.phone ?? null;
  const currentE164 = currentPhone ? toE164PH(currentPhone) : null;

  // --- password ---
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);

  // --- new number ---
  const [phone, setPhone] = useState(PREFIX);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  // --- code ---
  const [pending, setPending] = useState<string | null>(null); // E.164
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (stage !== 'verify' || resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [stage, resendIn]);

  const newE164 = toE164PH(phone);
  const newDigits = phone.replace(/^\+63\s?/, '').replace(/\D/g, '');
  const formatError = newDigits.length >= 10 ? phoneFormatError(phone) : undefined;
  const canSend = !!newE164 && !phoneFormatError(phone) && newE164 !== currentE164 && !sending;

  function startChange() {
    setPassword('');
    setPasswordError(undefined);
    setStage('password');
  }

  async function onCheckPassword() {
    if (!password || !currentPhone) return;
    setChecking(true);
    setPasswordError(undefined);
    try {
      await signInWithPassword(currentPhone, password);
      setPhone(PREFIX);
      setPhoneError(undefined);
      setStage('number');
    } catch {
      setPasswordError('Incorrect password.');
    } finally {
      setChecking(false);
    }
  }

  async function onSendCode() {
    if (!newE164) return;
    if (newE164 === currentE164) { setPhoneError('This is already your number.'); return; }
    setSending(true);
    setPhoneError(undefined);
    try {
      // Supabase texts a code to the new number; the sign-in phone only switches once it's confirmed.
      const { error } = await supabase.auth.updateUser({ phone: newE164 });
      if (error) throw error;
      setPending(newE164);
      setCode('');
      setCodeError(undefined);
      setResendIn(RESEND_SECONDS);
      setStage('verify');
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setPhoneError(err.code === 'phone_exists' || /already/i.test(err.message ?? '')
        ? 'This number is already registered to another account.'
        : isSmsSendError(e)
          ? SMS_SEND_FAILED
          : err.message || 'Could not send a code. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function onVerify() {
    if (!pending || code.length < 6) return;
    setVerifying(true);
    setCodeError(undefined);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: pending, token: code, type: 'phone_change' });
      if (error) throw error;
      await syncPhone();
      await refreshMember();
      setStage('done');
    } catch (e) {
      setCodeError((e as Error).message || 'Incorrect or expired code.');
    } finally {
      setVerifying(false);
    }
  }

  async function onResend() {
    if (!pending) return;
    try {
      const { error } = await supabase.auth.resend({ type: 'phone_change', phone: pending });
      if (error) throw error;
      setResendIn(RESEND_SECONDS);
      setCode('');
      setCodeError(undefined);
    } catch (e) {
      setCodeError((e as Error).message || 'Could not resend the code.');
    }
  }

  const resendLabel = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;

  // --- Done ---
  if (stage === 'done') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <CheckCircle2 size={52} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>Number Changed</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: 32 }}>
            Use {pending ? formatPH(pending) : 'your new number'} to sign in from now on.
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Done" onPress={() => setStage('view')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SMS code ---
  if (stage === 'verify') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <AppBar title="Verify Number" onBack={() => setStage('number')} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 32, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 26 }}>
            <View style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Phone size={30} color={semantic.brandDark} />
            </View>
            <Text variant="h1" style={{ fontSize: 21, marginTop: 4 }}>Verify your new number</Text>
            <Text variant="body" color="secondary">Enter the 6-digit code sent to</Text>
            <Text variant="label">{pending ? formatPH(pending) : ''}</Text>
          </View>

          <OtpInput value={code} onChange={setCode} />
          {codeError ? (
            <Text variant="caption" style={{ color: intent.danger.text, textAlign: 'center', marginTop: 12 }}>{codeError}</Text>
          ) : null}

          <View style={{ height: 28 }} />
          <Button label="Verify" onPress={onVerify} loading={verifying} disabled={code.length < 6} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 20 }}>
            <Text variant="body" color="secondary">Didn’t get it?</Text>
            {resendIn > 0 ? (
              <Text variant="body" color="muted">Resend in {resendLabel}</Text>
            ) : (
              <Text variant="label" color="brand" onPress={onResend}>Resend Code</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Password, then the new number ---
  if (stage === 'password' || stage === 'number') {
    const isPassword = stage === 'password';
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BAND_TOP }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
        <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
          <AppBar
            title={isPassword ? 'Confirm Password' : 'New Mobile Number'}
            backgroundColor={BAND_TOP}
            tintColor="#fff"
            onBack={() => setStage(isPassword ? 'view' : 'password')}
          />
          <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {isPassword ? (
              <>
                <Text variant="body" color="secondary" style={{ marginBottom: 16 }}>Enter your password to continue.</Text>
                <PasswordField
                  label="Password"
                  placeholder="Your account password"
                  value={password}
                  onChangeText={(t) => { setPassword(t); setPasswordError(undefined); }}
                  error={passwordError}
                />
              </>
            ) : (
              <>
                <Text variant="body" color="secondary" style={{ marginBottom: 16 }}>We’ll text a code to the new number.</Text>
                <Field
                  label="New Mobile Number"
                  placeholder="+63 900 000 0000"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(t) => { setPhone(formatPhoneInput(t)); setPhoneError(undefined); }}
                  error={phoneError ?? formatError}
                  leading={<Phone size={18} color={semantic.textMuted} />}
                />
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" onPress={() => setStage('view')} />
              </View>
              <View style={{ flex: 1 }}>
                {isPassword
                  ? <Button label="Continue" onPress={onCheckPassword} loading={checking} disabled={!password || checking} />
                  : <Button label="Send Code" onPress={onSendCode} loading={sending} disabled={!canSend} />}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  // --- View (default) ---
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Mobile Number" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <View style={{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }}>
          <View style={{ gap: 8 }}>
            <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Current number</Text>
            <Text variant="body">{currentPhone ? formatPH(currentPhone) : 'No number on file'}</Text>
            {currentPhone ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: intent.success.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                <Check size={11} color={intent.success.text} strokeWidth={3} />
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>Verified</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Lock size={13} color={semantic.textMuted} style={{ marginTop: 2 }} />
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>You sign in with this number. Changing it needs your password and a code sent to the new number.</Text>
          </View>
          <Button label="Change number" onPress={startChange} disabled={!currentPhone} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
