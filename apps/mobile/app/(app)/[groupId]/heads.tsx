/**
 * app/(app)/[groupId]/heads.tsx — Heads (member dashboard tile).
 * Promotes the read-only "Heads / shares" card that used to live only on the
 * Standing page into its own screen, and gives setHeads() a UI: self-service
 * for EVERYONE (member or officer alike) to configure their OWN heads — not
 * an Owner/organizer-configures-everyone screen. The server enforces the
 * "own row only" restriction (services/api/.../distributions.routes.js), so
 * this never sends another member's membership id.
 */
import { useEffect, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Layers, Minus, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useSetHeads } from '@/features/distribution/distribution.hooks';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text variant="body" color="secondary">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

export default function Heads() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const setHeads = useSetHeads(groupId!);

  // GroupContext's membership list is fetch-once (not realtime-wired like
  // the dashboard hooks), so reflect a successful save locally rather than
  // waiting for the next app-level refetch to show the new value.
  const [heads, setLocalHeads] = useState(membership?.heads ?? 1);
  useEffect(() => { if (membership) setLocalHeads(membership.heads); }, [membership?.heads]);
  const [draft, setDraft] = useState(heads);
  useEffect(() => setDraft(heads), [heads]);

  const dirty = draft !== heads;
  const expected = cycle ? Number(cycle.contribution_amount) * heads : null;

  async function onSave() {
    if (!membership) return;
    const ok = await setHeads.run(membership.id, draft);
    if (ok !== undefined) {
      setLocalHeads(draft);
      Alert.alert('Saved', `Heads updated to ${draft}.`);
    } else if (setHeads.error) {
      Alert.alert('Could not update heads', setHeads.error.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Heads" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: semantic.dashCard, borderRadius: 20, padding: 18, gap: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Layers size={18} color="#fff" />
            <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Heads held</Text>
          </View>
          <Text style={{ fontSize: 32, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: -0.5 }}>{heads}</Text>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.75, marginTop: 4 }}>
            Each head is a full share in the fund — it scales what you owe each cycle and what you're paid at year-end.
          </Text>
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
          <Text variant="h3" style={{ fontSize: 15, marginBottom: 4 }}>What this affects</Text>
          <InfoRow label="Per-head contribution" value={cycle ? formatPeso(cycle.contribution_amount) : '—'} />
          <InfoRow label="Your expected contribution" value={expected !== null ? formatPeso(expected) : '—'} />
          <Text variant="caption" color="muted" style={{ marginTop: 6 }}>
            Year-end net income is split proportionally by heads across the group — see Reports for the breakdown.
          </Text>
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }, shadowToken.card]}>
          <Text variant="h3" style={{ fontSize: 15 }}>Change your heads</Text>
          <Text variant="caption" color="muted">
            Adjust how many heads you hold. This is self-service — you can only change your own, not another member's.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => setDraft((d) => Math.max(1, d - 1))}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Minus size={18} color={semantic.textPrimary} />
            </Pressable>
            <TextInput
              value={String(draft)}
              onChangeText={(t) => {
                const n = Number(t.replace(/[^0-9]/g, ''));
                setDraft(Number.isFinite(n) && n > 0 ? n : 1);
              }}
              keyboardType="number-pad"
              style={{
                flex: 1, textAlign: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                height: 44, fontFamily: 'Poppins_700Bold', fontSize: 18, color: semantic.textPrimary,
              }}
            />
            <Pressable
              onPress={() => setDraft((d) => d + 1)}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus size={18} color={semantic.textPrimary} />
            </Pressable>
          </View>
          <Button
            label={setHeads.loading ? 'Saving…' : 'Save'}
            onPress={onSave}
            disabled={!dirty || setHeads.loading}
          />
          {setHeads.loading ? <ActivityIndicator color={semantic.brand} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
