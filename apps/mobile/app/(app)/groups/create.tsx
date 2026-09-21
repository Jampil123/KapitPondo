import { useState } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { RefreshCw, CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { createGroup, type Group } from '@/api/groups';
import { useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { VERIFY_META, verifyDestination } from '@/constants/verificationStatus';

const BAND_TOP = '#4C7C90';

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 9; i++) {
    if (i > 0 && i % 3 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function Label({ children }: { children: string }) {
  return <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 4 }}>{children}</Text>;
}

const inputStyle = {
  backgroundColor: semantic.surfaceAlt,
  borderRadius: 12,
  paddingHorizontal: 16,
  color: semantic.textPrimary,
};

export default function CreateGroup() {
  const router = useRouter();
  const { refresh } = useGroups();
  const { member } = useAuth();
  const status = member?.verification_status ?? 'unverified';
  const verified = status === 'verified';
  const vmeta = VERIFY_META[status] ?? VERIFY_META.unverified;
  const vtone = intent[vmeta.tone];
  const [name, setName] = useState('');
  const [fundCode, setFundCode] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Group | null>(null);

  async function handleCreate() {
    setError('');
    if (!verified) return Alert.alert('Verification required', 'You need a verified account to create a group.');
    if (!name.trim()) { setError('Please enter a group name.'); return; }
    setLoading(true);
    try {
      const code = fundCode.trim() || generateCode();
      const { group } = await createGroup({ name: name.trim(), fund_code: code, description: description.trim() || null });
      await refresh();
      setCreated(group);
    } catch (e) {
      setError((e as Error).message || 'Could not create the group. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <CheckCircle2 size={56} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 24, textAlign: 'center', marginBottom: 8 }}>Group Created</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
            Share this fund code so members can join your group:
          </Text>
          <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 16, paddingHorizontal: 32, paddingVertical: 20, marginBottom: 32 }}>
            <Text variant="h1" style={{ letterSpacing: 4 }}>{created.fund_code}</Text>
          </View>
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label="Go to Dashboard"
              onPress={() => router.replace({ pathname: '/(app)/[groupId]', params: { groupId: created.id } })}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: BAND_TOP }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
        <AppBar title="Create a Group" backgroundColor={BAND_TOP} tintColor="#fff" />

        <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {!verified && (
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 10, marginTop: 8, marginBottom: 20, borderWidth: 1, borderColor: vtone.soft }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: vtone.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <vmeta.icon size={16} color={vtone.text} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label" style={{ fontSize: 13.5, color: vtone.text }}>{vmeta.title}</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>
                    {vmeta.subtitle(member?.verification_rejection_reason ?? null)}
                  </Text>
                </View>
              </View>
              {vmeta.btn ? (
                <Button label={vmeta.btn} variant="ghost" onPress={() => router.push(verifyDestination(status) as any)} />
              ) : null}
            </View>
          )}

          {verified ? (
            <View style={{ marginTop: 8 }}>
              <Label>Group Name</Label>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Barangay Unity Fund"
                placeholderTextColor={semantic.textMuted}
                style={[inputStyle, typography.body, { height: 56, marginBottom: 20 }]}
              />

              <Label>Fund Code (optional)</Label>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                <TextInput
                  value={fundCode}
                  onChangeText={(t) => setFundCode(t.toUpperCase())}
                  placeholder="ABC-123-XYZ"
                  placeholderTextColor={semantic.textMuted}
                  autoCapitalize="characters"
                  style={[inputStyle, typography.body, { flex: 1, height: 56 }]}
                />
                <Pressable
                  onPress={() => setFundCode(generateCode())}
                  style={{ height: 56, paddingHorizontal: 20, backgroundColor: semantic.surfaceAlt, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                >
                  <RefreshCw size={22} color={semantic.textPrimary} />
                </Pressable>
              </View>
              <Label>Description</Label>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Group goals, contribution schedule, rules..."
                placeholderTextColor={semantic.textMuted}
                multiline
                textAlignVertical="top"
                style={[inputStyle, typography.body, { height: 112, paddingVertical: 14, marginBottom: 20 }]}
              />

              {error ? <Text variant="bodySmall" style={{ color: '#C25C5E', marginBottom: 12 }}>{error}</Text> : null}

              <Button label="Create Group" onPress={handleCreate} loading={loading} disabled={!name.trim()} />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
