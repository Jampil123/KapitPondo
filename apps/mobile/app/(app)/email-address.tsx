import { useEffect, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Check, Plus, CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Field, PasswordField } from '@/components/ui/Field';
import { OtpInput } from '@/components/ui/OtpInput';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { supabase } from '@/lib/supabase';
import { updateProfile } from '@/api/members';
import { useAuth } from '@/context/AuthContext';

const BAND_TOP = '#4C7C90';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 2 * 60;

type Stage = 'view' | 'add' | 'verify' | 'verified';

export default function EmailAddress() {
  const { member, signInWithPassword, refreshMember } = useAuth();

  const [stage, setStage] = useState<Stage>('view');
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // --- "add" stage ---
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [addError, setAddError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // --- "verify" stage ---
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);

  useEffect(() => {
    refreshAuthUser();
  }, []);

  useEffect(() => {
    if (stage !== 'verify' || resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [stage, resendIn]);

  async function refreshAuthUser() {
    const { data } = await supabase.auth.getUser();
    setAuthEmail(data.user?.email ?? null);
    setConfirmed(!!data.user?.email_confirmed_at);
  }

  // `||` (not `??`) on purpose — an empty string (seen from either source
  // for a member who never set an email) must fall through to null too, or
  // the card renders neither the email nor the "No email on file" fallback.
  const currentEmail = authEmail || member?.email || null;
  const emailValid = EMAIL_RE.test(newEmail.trim());
  const emailError = emailTouched && newEmail.trim() && !emailValid ? 'Please enter a valid email address.' : undefined;
  const canSubmitAdd =
    emailValid && newEmail.trim().toLowerCase() !== (currentEmail ?? '').toLowerCase() && password.length > 0 && !submitting;

  function openAdd() {
    setNewEmail('');
    setPassword('');
    setEmailTouched(false);
    setAddError(undefined);
    setPasswordError(undefined);
    setStage('add');
  }

  async function onSubmitAdd() {
    if (!canSubmitAdd || !member?.phone) return;
    setSubmitting(true);
    setAddError(undefined);
    setPasswordError(undefined);
    try {
      await signInWithPassword(member.phone, password);
    } catch {
      setPasswordError('Incorrect password.');
      setSubmitting(false);
      return;
    }
    try {
      const target = newEmail.trim();
      const { error } = await supabase.auth.updateUser({ email: target });
      if (error) throw error;
      await updateProfile({ email: target });
      await refreshMember();
      startVerify(target);
    } catch (e) {
      setAddError((e as Error).message || 'Could not update your email. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function startVerify(email: string) {
    setPendingEmail(email);
    setCode('');
    setCodeError(undefined);
    setResendIn(RESEND_SECONDS);
    setStage('verify');
  }

  async function onVerifyExisting() {
    if (!currentEmail) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'email_change', email: currentEmail });
      if (error) throw error;
      startVerify(currentEmail);
    } catch (e) {
      setAddError((e as Error).message || 'Could not send a verification code. Please try again.');
      setStage('view');
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifyCode() {
    if (code.length < 6) return;
    setVerifying(true);
    setCodeError(undefined);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: pendingEmail, token: code, type: 'email_change' });
      if (error) throw error;
      await refreshAuthUser();
      setStage('verified');
    } catch (e) {
      setCodeError((e as Error).message || 'Incorrect or expired code.');
    } finally {
      setVerifying(false);
    }
  }

  async function onResendCode() {
    try {
      const { error } = await supabase.auth.resend({ type: 'email_change', email: pendingEmail });
      if (error) throw error;
      setResendIn(RESEND_SECONDS);
      setCode('');
      setCodeError(undefined);
    } catch (e) {
      setCodeError((e as Error).message || 'Could not resend the code.');
    }
  }

  const resendLabel = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;

  // --- Verified success ---
  if (stage === 'verified') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <CheckCircle2 size={52} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>Email Verified</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: 32 }}>
            {pendingEmail} is now confirmed on your account.
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Done" onPress={() => setStage('view')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- Verify code ---
  if (stage === 'verify') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <AppBar title="Verify Email" onBack={() => setStage('view')} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}>
          <View style={{ alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 26 }}>
            <View style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={30} color={semantic.brandDark} />
            </View>
            <Text variant="h1" style={{ fontSize: 21, marginTop: 4 }}>Verify your email</Text>
            <Text variant="body" color="secondary">Enter the 6-digit code sent to</Text>
            <Text variant="label">{pendingEmail}</Text>
          </View>

          <OtpInput value={code} onChange={setCode} />
          {codeError ? (
            <Text variant="caption" style={{ color: intent.danger.text, textAlign: 'center', marginTop: 12 }}>{codeError}</Text>
          ) : null}

          <View style={{ height: 28 }} />
          <Button label="Verify" onPress={onVerifyCode} loading={verifying} disabled={code.length < 6} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 20 }}>
            <Text variant="body" color="secondary">Didn't get it?</Text>
            {resendIn > 0 ? (
              <Text variant="body" color="muted">Resend in {resendLabel}</Text>
            ) : (
              <Text variant="label" color="brand" onPress={onResendCode}>Resend Code</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Add / replace email ---
  if (stage === 'add') {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: BAND_TOP }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
          <AppBar title="Add Email" backgroundColor={BAND_TOP} tintColor="#fff" onBack={() => setStage('view')} />
          <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Field
              label="New Email Address"
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={newEmail}
              onChangeText={setNewEmail}
              onBlur={() => setEmailTouched(true)}
              error={emailError}
              leading={<Mail size={18} color={semantic.textMuted} />}
            />
            <PasswordField
              label="Confirm Your Password"
              placeholder="Your account password"
              value={password}
              onChangeText={(t) => { setPassword(t); setPasswordError(undefined); }}
              error={passwordError}
            />
            {addError ? (
              <Text variant="caption" style={{ color: intent.danger.text, marginBottom: 8 }}>{addError}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" onPress={() => setStage('view')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Send Code" onPress={onSubmitAdd} loading={submitting} disabled={!canSubmitAdd} />
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
      <AppBar
        title="Email Address"
        backgroundColor={BAND_TOP}
        tintColor="#fff"
        right={
          <Pressable
            onPress={openAdd}
            hitSlop={10}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={18} color="#fff" />
          </Pressable>
        }
      />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Mail size={28} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 20, marginBottom: 4 }}>Your email address</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            Used to help recover your account and receive important updates.
          </Text>
        </View>

        <View style={{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }}>
          <View style={{ gap: 8 }}>
            <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Current email</Text>
            <Text variant="body">{currentEmail ?? 'No email on file'}</Text>
            {currentEmail ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                backgroundColor: confirmed ? intent.success.soft : intent.warning.soft,
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
              }}>
                {confirmed ? <Check size={11} color={intent.success.text} strokeWidth={3} /> : null}
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: confirmed ? intent.success.text : intent.warning.text }}>
                  {confirmed ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            ) : null}
          </View>

          {addError ? (
            <Text variant="caption" style={{ color: intent.danger.text }}>{addError}</Text>
          ) : null}

          {currentEmail && !confirmed ? (
            <Button label="Verify now" onPress={onVerifyExisting} loading={submitting} />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
