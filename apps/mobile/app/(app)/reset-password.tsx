import { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/Field';
import { PasswordRules, passwordMeetsRules } from '@/components/ui/PasswordRules';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';
import { supabase } from '@/lib/supabase';

const BAND_TOP = '#4C7C90';

// Reached from Forgot Password once the SMS code is verified — the OTP has
// already signed the user in, so this only sets the new password.
export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordValid = passwordMeetsRules(password);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;
  const confirmError = confirmTouched && confirmPassword.length > 0 && !passwordsMatch ? 'Passwords do not match.' : undefined;
  const canSubmit = passwordValid && passwordsMatch && !loading;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(undefined);
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (e) {
      const message = (e as Error).message || '';
      setError(/different from the old/i.test(message)
        ? 'New password must be different from your old password.'
        : message || 'Could not update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <CheckCircle2 size={52} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 22, textAlign: 'center', marginBottom: 32 }}>Password Updated</Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Continue" onPress={() => router.replace('/(app)/groups')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BAND_TOP }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
        <AppBar title="Set New Password" back={false} backgroundColor={BAND_TOP} tintColor="#fff" />
        <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <PasswordField
            label="New Password"
            placeholder="Create a new password"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(undefined); }}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            error={error}
          />
          <PasswordRules password={password} visible={passwordFocused || password.length > 0} />
          <PasswordField
            label="Confirm New Password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onBlur={() => setConfirmTouched(true)}
            error={confirmError}
          />

          <View style={{ marginTop: 8 }}>
            <Button label="Update Password" onPress={onSubmit} loading={loading} disabled={!canSubmit} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
