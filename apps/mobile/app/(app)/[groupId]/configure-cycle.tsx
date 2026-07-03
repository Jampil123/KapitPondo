/**
 * app/(app)/[groupId]/configure-cycle.tsx
 * ----------------------------------------------------------------------------
 * Owner creates/manages fund cycles (M4). Designer's form, wired to our API —
 * but ONLY the fields our cycle schema actually stores:
 *   name, contribution_amount, start_date, end_date, frequency, penalty_amount.
 *
 * The designer's extra fields (interest rate, max loan, loan term limit, grace
 * period, number of cycles, cover photo) have NO column yet — shown as a note,
 * not faked. Add them to the cycles schema later, then extend this form.
 *
 * Also lists existing cycles with Activate / Close (one active cycle enforced
 * by the DB — activating a second fails, surfaced as an alert).
 */
import { useState } from 'react';
import { View, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { toAmountString, formatPeso } from '@/lib/money';
import { useCycles, useCreateCycle, useActivateCycle, useCloseCycle } from '@/features/cycles/cycles.hooks';
import type { Frequency } from '@/api/cycles';

function Label({ children }: { children: string }) {
  return <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 4 }}>{children}</Text>;
}
const inputStyle = { backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 52, fontFamily: 'Poppins_400Regular', fontSize: 14, color: semantic.textPrimary };

export default function ConfigureCycle() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const cycles = useCycles(groupId!);
  const create = useCreateCycle(groupId!);
  const activate = useActivateCycle(groupId!);
  const close = useCloseCycle(groupId!);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [penalty, setPenalty] = useState('');

  async function onCreate() {
    if (!name.trim() || !toAmountString(amount) || !start.trim()) {
      Alert.alert('Missing info', 'Name, contribution amount, and start date are required.');
      return;
    }
    const ok = await create.run({
      name: name.trim(),
      contribution_amount: toAmountString(amount)!,
      start_date: start.trim(),
      end_date: end.trim() || undefined,
      frequency: freq,
      penalty_amount: penalty ? toAmountString(penalty) ?? undefined : undefined,
      penalty_type: 'fixed',
    });
    if (ok !== undefined) {
      setName(''); setAmount(''); setStart(''); setEnd(''); setPenalty('');
      cycles.refetch();
    } else if (create.error) {
      Alert.alert('Could not create cycle', create.error.message);
    }
  }

  async function onActivate(id: string) {
    const ok = await activate.run(id);
    if (ok !== undefined) cycles.refetch();
    else if (activate.error) Alert.alert('Could not activate', activate.error.status === 409 || /active/i.test(activate.error.message) ? 'Close the current active cycle first — only one can be active at a time.' : activate.error.message);
  }
  async function onClose(id: string) {
    Alert.alert('Close cycle', 'Close this cycle? This is usually done at year-end.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', style: 'destructive', onPress: async () => { const ok = await close.run(id); if (ok !== undefined) cycles.refetch(); } },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Configure Cycle" subtitle="Organizer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }} keyboardShouldPersistTaps="handled">
        {/* Existing cycles */}
        {(cycles.data?.length ?? 0) > 0 && (
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="secondary">Cycles</Text>
            {cycles.data!.map((c) => (
              <View key={c.id} style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 10 }, shadowToken.card]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{c.name}</Text>
                    <Text variant="caption" color="secondary">{formatPeso(c.contribution_amount)} · {c.frequency}</Text>
                  </View>
                  <StatusBadge entity="cycle" value={c.status} />
                </View>
                {c.status === 'draft' && <Button label="Activate" onPress={() => onActivate(c.id)} loading={activate.loading} style={{ paddingVertical: 10 }} />}
                {c.status === 'active' && <Button label="Close cycle" variant="ghost" onPress={() => onClose(c.id)} style={{ paddingVertical: 10 }} />}
              </View>
            ))}
          </View>
        )}

        {/* New cycle form */}
        <View style={{ gap: 12 }}>
          <Text variant="overline" color="secondary">New cycle</Text>
          <View><Label>Cycle name</Label><TextInput value={name} onChangeText={setName} placeholder="e.g. 2026 Cycle" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
          <View><Label>Contribution amount</Label><TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="₱ per member per period" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Label>Start date</Label><TextInput value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
            <View style={{ flex: 1 }}><Label>End date</Label><TextInput value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
          </View>
          <View>
            <Label>Frequency</Label>
            <Segmented<Frequency>
              options={[{ key: 'monthly', label: 'Monthly' }, { key: 'weekly', label: 'Weekly' }]}
              value={freq}
              onChange={setFreq}
            />
          </View>
          <View><Label>Late penalty (fixed ₱)</Label><TextInput value={penalty} onChangeText={setPenalty} keyboardType="numeric" placeholder="e.g. 150" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>

          <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12 }}>
            <Text variant="caption" color="secondary">
              Interest rate, max loan, loan term limit, grace period, and number of cycles aren't stored yet — they need schema columns before this form can save them.
            </Text>
          </View>

          <Button label="Create cycle" onPress={onCreate} loading={create.loading} disabled={!name.trim()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
