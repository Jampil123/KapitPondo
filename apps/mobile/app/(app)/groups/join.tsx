import { useState } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { joinByCode } from '@/api/groups';
import { useGroups } from '@/context/GroupContext';

const BAND_TOP = '#4C7C90';

export default function JoinGroup() {
  const router = useRouter();
  const { refresh } = useGroups();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleJoin() {
    setError('');
    if (code.trim().length < 4) { setError('Please enter a valid fund code.'); return; }
    setLoading(true);
    try {
      await joinByCode(code.trim());
      await refresh();
      setSent(true);
    } catch (e) {
      setError((e as Error).message || 'Could not join. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  }

  // Pending state — the owner must approve before the user is Active.
  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Clock size={52} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>Request Sent</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: 32 }}>
            The group organizer will review your request.
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Back to Home" onPress={() => router.replace('/(app)/groups')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: BAND_TOP }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
        <AppBar title="Join a Group" backgroundColor={BAND_TOP} tintColor="#fff" />

        <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 24, padding: 20, gap: 16, marginTop: 24 }}>
            <Text variant="overline" color="secondary">Fund Code</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="e.g. KP-882-XYZ"
              placeholderTextColor={semantic.textMuted}
              autoCapitalize="characters"
              maxLength={12}
              style={[typography.h2, { backgroundColor: semantic.background, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, color: semantic.textPrimary, textAlign: 'center', letterSpacing: 4 }]}
            />

            {error ? <Text variant="bodySmall" style={{ color: '#C25C5E' }}>{error}</Text> : null}

            <Button label="Join Group" onPress={handleJoin} loading={loading} disabled={code.trim().length < 4} />
          </View>

          <View style={{ marginTop: 24, gap: 16, paddingBottom: 32 }}>
            <Pressable onPress={() => router.replace('/(app)/groups/create')} style={{ backgroundColor: semantic.surface, borderWidth: 1, borderColor: semantic.borderStrong, padding: 16, borderRadius: 24 }}>
              <Plus size={28} color={semantic.textPrimary} style={{ marginBottom: 4 }} />
              <Text variant="label">Need a new group?</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
