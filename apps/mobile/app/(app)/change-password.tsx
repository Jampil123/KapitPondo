import { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/Field';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const BAND_TOP = '#4C7C90';

export default function ChangePassword() {
  const router = useRouter();
  const { member, signInWithPassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({ current: false, new: false, confirm: false });
  const [currentError, setCurrentError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const newPasswordValid = newPassword.length >= 8;
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === newPassword;
  const isDifferent = !currentPassword || newPassword !== currentPassword;

  const newError = touched.new && !newPasswordValid ? 'Password must be at least 8 characters.' : undefined;
  const confirmError = touched.confirm && confirmPassword.length > 0 && !passwordsMatch
    ? 'Passwords do not match.'
    : undefined;
  const sameAsCurrentError = touched.new && newPasswordValid && !isDifferent
    ? 'New password must be different from your current password.'
    : undefined;

  const canSubmit =
    currentPassword.length > 0 && newPasswordValid && passwordsMatch && isDifferent && !loading;

  async function onSubmit() {
    if (!canSubmit || !member?.phone) return;
    setCurrentError(undefined);
    setLoading(true);
    try {
      await signInWithPassword(member.phone, currentPassword);
    } catch {
      setCurrentError('Current password is incorrect.');
      setLoading(false);
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      setCurrentError((e as Error).message || 'Could not update your password. Please try again.');
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
            <Button label="Done" onPress={() => router.back()} />
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
        <AppBar title="Change Password" backgroundColor={BAND_TOP} tintColor="#fff" />
        <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <PasswordField
            label="Current Password"
            placeholder="Your current password"
            value={currentPassword}
            onChangeText={(t) => { setCurrentPassword(t); setCurrentError(undefined); }}
            onBlur={() => setTouched((t) => ({ ...t, current: true }))}
            error={currentError}
          />
          <PasswordField
            label="New Password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChangeText={setNewPassword}
            onBlur={() => setTouched((t) => ({ ...t, new: true }))}
            error={newError || sameAsCurrentError}
          />
          <PasswordField
            label="Confirm New Password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
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
