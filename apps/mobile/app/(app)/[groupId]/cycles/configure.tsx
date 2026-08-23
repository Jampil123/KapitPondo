/**
 * app/(app)/[groupId]/configure-cycle.tsx
 * ----------------------------------------------------------------------------
 * Owner creates/manages fund cycles (M4). Designer's form, wired to our API:
 *   name, contribution_amount, start_date, end_date, frequency, penalty_amount,
 *   contribution_due_day, default_interest_rate, minimum_loan_amount,
 *   early_termination_penalty.
 *
 * default_interest_rate is a suggested default only — the officer can still
 * set a different rate per loan at approval time (lending module is
 * unchanged); loan term limit, grace period, number of cycles, and cover
 * photo remain unimplemented (no column, no note faked here either).
 *
 * Creating a cycle activates it immediately unless the group already has an
 * active one, in which case it's created in "Setup" (draft) until that one
 * is closed — Activate / Close below cover that case (one active cycle
 * enforced by the DB — activating a second fails, surfaced as an alert).
 */
import { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Modal, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
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

function parseIsoDate(value: string): Date | null {
  if (!value.trim()) return null;
  const d = new Date(`${value.trim()}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDisplayDate(value: string): string {
  const d = parseIsoDate(value);
  return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : value;
}

/**
 * Tap-to-open date field backed by @expo/ui's native DateTimePicker (already
 * an app dependency, works via the dev client — see expo-dev-client). Web has
 * no native picker to back it (@expo/ui's web build is a no-op there), so it
 * falls back to the original typed YYYY-MM-DD input.
 */
function DateInput({ label, value, onChange, minimumDate }: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const current = parseIsoDate(value) ?? new Date();

  if (Platform.OS === 'web') {
    return (
      <View>
        <Label>{label}</Label>
        <TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={semantic.textMuted} style={inputStyle} />
      </View>
    );
  }

  return (
    <View>
      <Label>{label}</Label>
      <Pressable
        onPress={() => setShow(true)}
        style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
      >
        <Text variant="body" style={{ fontSize: 14, color: value ? semantic.textPrimary : semantic.textMuted }}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
        <Calendar size={17} color={semantic.textMuted} />
      </Pressable>

      {show && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          value={current}
          minimumDate={minimumDate}
          onValueChange={(_e, date) => { onChange(toIsoDate(date)); setShow(false); }}
          onDismiss={() => setShow(false)}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={() => setShow(false)}>
            <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
              <Text variant="h3" style={{ fontSize: 17 }}>{label}</Text>
              <DateTimePicker
                mode="date"
                display="inline"
                value={current}
                minimumDate={minimumDate}
                onValueChange={(_e, date) => onChange(toIsoDate(date))}
              />
              <Button label="Done" onPress={() => setShow(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

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
  const [dueDay, setDueDay] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [minLoan, setMinLoan] = useState('');
  const [earlyTermPenalty, setEarlyTermPenalty] = useState('');

  async function onCreate() {
    if (!name.trim() || !toAmountString(amount) || !start.trim()) {
      Alert.alert('Missing info', 'Name, contribution amount, and start date are required.');
      return;
    }
    const day = dueDay ? Number(dueDay) : undefined;
    if (day != null && (day < 1 || day > 31)) {
      Alert.alert('Invalid due day', 'Enter a day of the month between 1 and 31.');
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
      contribution_due_day: day,
      default_interest_rate: interestRate ? String(Number(interestRate) / 100) : undefined,
      minimum_loan_amount: minLoan ? toAmountString(minLoan) ?? undefined : undefined,
      early_termination_penalty: earlyTermPenalty ? toAmountString(earlyTermPenalty) ?? undefined : undefined,
    });
    if (ok !== undefined) {
      setName(''); setAmount(''); setStart(''); setEnd(''); setPenalty('');
      setDueDay(''); setInterestRate(''); setMinLoan(''); setEarlyTermPenalty('');
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
            <View style={{ flex: 1 }}><DateInput label="Start date" value={start} onChange={setStart} /></View>
            <View style={{ flex: 1 }}><DateInput label="End date" value={end} onChange={setEnd} minimumDate={parseIsoDate(start) ?? undefined} /></View>
          </View>
          <View>
            <Label>Frequency</Label>
            <Segmented<Frequency>
              options={[{ key: 'monthly', label: 'Monthly' }, { key: 'weekly', label: 'Weekly' }]}
              value={freq}
              onChange={setFreq}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Label>Late penalty (fixed ₱)</Label><TextInput value={penalty} onChangeText={setPenalty} keyboardType="numeric" placeholder="e.g. 150" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
            <View style={{ flex: 1 }}><Label>Contribution due day</Label><TextInput value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 5" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Label>Default loan interest (% / month)</Label><TextInput value={interestRate} onChangeText={setInterestRate} keyboardType="numeric" placeholder="e.g. 3" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
            <View style={{ flex: 1 }}><Label>Minimum loan amount</Label><TextInput value={minLoan} onChangeText={setMinLoan} keyboardType="numeric" placeholder="₱" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
          </View>
          <View><Label>Early-termination penalty (₱)</Label><TextInput value={earlyTermPenalty} onChangeText={setEarlyTermPenalty} keyboardType="numeric" placeholder="e.g. 500" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>

          <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12 }}>
            <Text variant="caption" color="secondary">
              The default loan interest rate is a starting suggestion — the organizer can still set a different rate per loan when approving it. Loan term limit, grace period, and number of cycles aren't stored yet.
            </Text>
          </View>

          <Button label="Create cycle" onPress={onCreate} loading={create.loading} disabled={!name.trim()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
