/**
 * app/(auth)/signin.tsx  — "Welcome back" (prototype screen 2).
 * Phone + password. On success, the root layout redirects to (app).
 */
import { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Phone, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';

export default function SignIn() {
  const router = useRouter();
  const { signInWithPassword } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = phone.trim() && password.length > 0;

  async function onSignIn() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await signInWithPassword(phone, password);
      // root _layout sees status === 'signedIn' and redirects to (app).
    } catch (e) {
      Alert.alert('Sign in failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 }}>
        <View style={{ gap: 3, marginTop: 10, marginBottom: 22 }}>
          <Text variant="h1" style={{ fontSize: 23 }}>Welcome back</Text>
          <Text variant="body" color="secondary">Sign in to manage your group funds.</Text>
        </View>

        <Field
          label="Phone Number"
          placeholder="+63 900 000 0000"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          leading={<Phone size={18} color={semantic.textMuted} />}
        />
        <PasswordField
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          leading={<Lock size={18} color={semantic.textMuted} />}
        />

        <View style={{ alignItems: 'flex-end', marginTop: -4, marginBottom: 20 }}>
          <Text variant="body" color="brand" onPress={() => router.push('/(auth)/forgot')}>
            Forgot Password?
          </Text>
        </View>

        <Button label="Sign In" onPress={onSignIn} loading={loading} disabled={!canSubmit} />
    c
      </ScrollView>
    </SafeAreaView>
  );
}
