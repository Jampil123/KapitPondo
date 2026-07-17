/**
 * app/(app)/groups/create.tsx — create a group (migrated to our primitives).
 * Keeps the co-dev design: optional fund code with an auto-generate button.
 * Success shows the shareable code; "Go to Dashboard" opens the single
 * [groupId] route (role-switched).
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { semantic, shadowToken } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { createGroup, type Group } from '@/api/groups';
import { useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';

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
  const verified = member?.verification_status === 'verified';
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: semantic.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 60 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <ArrowLeft size={22} color={semantic.textPrimary} />
          </Pressable>
          <Text variant="h2" style={{ fontSize: 20 }}>Create a Group</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ marginTop: 8, marginBottom: 24 }}>
            <Text variant="h1" style={{ fontSize: 24, marginBottom: 4 }}>Start a new collective</Text>
            <Text variant="body" color="secondary">Fill in the details to create your communal savings group.</Text>
          </View>

          {!verified && (
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 8, marginBottom: 20 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <ShieldCheck size={18} color="#A87C2C" />
                <Text variant="label" style={{ fontSize: 13, color: '#A87C2C' }}>Verify your identity to create a group</Text>
              </View>
              <Button label="Verify now" variant="ghost" onPress={() => router.push('/(app)/identity' as any)} />
            </View>
          )}

          <Label>Group Name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Barangay Unity Fund"
            placeholderTextColor={semantic.textMuted}
            style={[inputStyle, typography.body, { height: 56, marginBottom: 20 }]}
          />

          <Label>Fund Code (optional)</Label>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
            <TextInput
              value={fundCode}
              onChangeText={(t) => setFundCode(t.toUpperCase())}
              placeholder="ABC-123-XYZ"
              placeholderTextColor={semantic.textMuted}
              autoCapitalize="characters"
              style={[inputStyle, typography.body, { flex: 1, height: 56 }]}
            />
            <Pressable onPress={() => setFundCode(generateCode())} style={{ height: 56, paddingHorizontal: 20, backgroundColor: semantic.surfaceAlt, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={22} color={semantic.textPrimary} />
            </Pressable>
          </View>
          <Text variant="bodySmall" color="secondary" style={{ marginBottom: 20, marginLeft: 4 }}>
            Members use this code to join. Leave blank to auto-generate.
          </Text>

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

          <Button label="Create Group" onPress={handleCreate} loading={loading} disabled={!name.trim() || !verified} />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
