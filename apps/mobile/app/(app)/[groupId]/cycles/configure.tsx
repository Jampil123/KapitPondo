import { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Modal, Platform } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { toAmountString, formatPeso } from '@/lib/money';
import { useQuery } from '@/hooks/useApi';
import { listDistributions } from '@/api/distribution';
import { selectActiveCycle } from '@/api/cycles';
import { useCycles, useCreateCycle, useActivateCycle, useCloseCycle } from '@/features/cycles/cycles.hooks';

function Label({ children }: { children: string }) {
  return <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 4 }}>{children}</Text>;
}
const inputStyle = { backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 52, fontFamily: 'Poppins_400Regular', fontSize: 14, color: semantic.textPrimary };
const cardStyle = [{ backgroundColor: semantic.surface, borderRadius: 20 }, shadowToken.card] as const;

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

function StatusPill({ entity, value }: { entity: 'cycle'; value?: string | null }) {
  const meta = getStatusMeta(entity, value);
  const tone = intent[meta.intent];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tone.soft, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 20 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone.base }} />
      <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: tone.text }}>{meta.label}</Text>
    </View>
  );
}

function Gate({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{
        width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
        backgroundColor: done ? intent.success.base : semantic.borderStrong,
      }}>
        <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: done ? '#fff' : semantic.textSecondary }}>{done ? '✓' : '•'}</Text>
      </View>
      <Text variant="caption" style={{ color: done ? semantic.textPrimary : semantic.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>{label}</Text>
    </View>
  );
}

export default function ConfigureCycle() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const cycles = useCycles(groupId!);
  const create = useCreateCycle(groupId!);
  const activate = useActivateCycle(groupId!);
  const close = useCloseCycle(groupId!);
  const distributions = useQuery(() => listDistributions(groupId!), [groupId]);

  const allCycles = cycles.data ?? [];
  const primaryCycle = selectActiveCycle(allCycles) ?? allCycles.find((c) => c.status === 'draft') ?? null;
  const otherCycles = allCycles.filter((c) => c.id !== primaryCycle?.id);
  const latestCycle = allCycles[0] ?? null; // listCycles returns newest first
  const cycleDistribution = primaryCycle
    ? (distributions.data ?? []).find((d) => d.cycle_id === primaryCycle.id) ?? null
    : null;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [penalty, setPenalty] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [minLoan, setMinLoan] = useState('');
  const [earlyTermPenalty, setEarlyTermPenalty] = useState('');
  const [copied, setCopied] = useState(false);

  const missing = [
    { label: 'name', ok: !!name.trim() },
    { label: 'start date', ok: !!start.trim() },
    { label: 'amount', ok: !!toAmountString(amount) },
  ].filter((f) => !f.ok);

  function onCopySettings() {
    if (!latestCycle) return;
    setAmount(String(latestCycle.contribution_amount ?? ''));
    setPenalty(latestCycle.penalty_amount ? String(latestCycle.penalty_amount) : '');
    setDueDay(latestCycle.contribution_due_day ? String(latestCycle.contribution_due_day) : '');
    setInterestRate(latestCycle.default_interest_rate ? String(Number(latestCycle.default_interest_rate) * 100) : '');
    setMinLoan(latestCycle.minimum_loan_amount ? String(latestCycle.minimum_loan_amount) : '');
    setEarlyTermPenalty(latestCycle.early_termination_penalty ? String(latestCycle.early_termination_penalty) : '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function onCreate() {
    if (missing.length) {
      Alert.alert('Missing info', 'Name, start date, and contribution amount are required.');
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
      frequency: 'monthly',
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
  function onClose(id: string) {
    Alert.alert('Close cycle', 'Close this cycle? This is usually done at year-end, after the distribution is finalized.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', style: 'destructive', onPress: async () => { const ok = await close.run(id); if (ok !== undefined) cycles.refetch(); } },
    ]);
  }
  function goToYearEnd() {
    router.push({ pathname: '/(app)/[groupId]/distribution/year-end' as any, params: { groupId } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Configure Cycle" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 8 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Current cycle ---------------- */}
        {primaryCycle ? (
          <>
            <Text variant="overline" color="secondary" style={{ marginBottom: 10 }}>Current cycle</Text>
            <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" style={{ fontSize: 17 }}>{primaryCycle.name}</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 4 }}>
                    {formatPeso(primaryCycle.contribution_amount)} per head · {primaryCycle.end_date ? `ends ${formatDisplayDate(primaryCycle.end_date)}` : 'no end date'}
                  </Text>
                </View>
                <StatusPill entity="cycle" value={primaryCycle.status} />
              </View>

              {primaryCycle.status === 'draft' ? (
                <View style={{ marginTop: 15 }}>
                  <Button label="Activate this cycle" onPress={() => onActivate(primaryCycle.id)} loading={activate.loading} style={{ paddingVertical: 11 }} />
                </View>
              ) : (
                <>
                  {/* ---------------- Closing ---------------- */}
                  <View style={{ marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderColor: 'rgba(42,62,75,0.1)', gap: 11 }}>
                    <Text variant="label" style={{ color: semantic.brandDark }}>Before closing</Text>

                    <View style={{ gap: 8 }}>
                      <Gate done={!!cycleDistribution && ['previewed', 'verified', 'finalized'].includes(cycleDistribution.status)} label="Year-end preview prepared" />
                      <Gate done={!!cycleDistribution && ['verified', 'finalized'].includes(cycleDistribution.status)} label="Verified by Auditor" />
                      <Gate done={cycleDistribution?.status === 'finalized'} label="Finalized by you" />
                    </View>

                    {cycleDistribution?.status !== 'finalized' ? (
                      <Button label="Go to Year-End Distribution" variant="ghost" onPress={goToYearEnd} style={{ paddingVertical: 11 }} />
                    ) : null}
                    <Button label="Close cycle" variant="ghost" onPress={() => onClose(primaryCycle.id)} loading={close.loading} style={{ paddingVertical: 11 }} />
                  </View>
                </>
              )}
            </View>
          </>
        ) : null}

        {/* ---------------- Other cycles ---------------- */}
        {otherCycles.length > 0 && (
          <View style={{ gap: 10, marginTop: 18 }}>
            <Text variant="overline" color="secondary">Other cycles</Text>
            {otherCycles.map((c) => (
              <View key={c.id} style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 10 }, shadowToken.card]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{c.name}</Text>
                    <Text variant="caption" color="secondary">{formatDisplayDate(c.start_date)}{c.end_date ? ` – ${formatDisplayDate(c.end_date)}` : ''}</Text>
                  </View>
                  <StatusPill entity="cycle" value={c.status} />
                </View>
                {c.status === 'draft' && <Button label="Activate" onPress={() => onActivate(c.id)} loading={activate.loading} style={{ paddingVertical: 10 }} />}
              </View>
            ))}
          </View>
        )}

        {/* ---------------- New cycle form ---------------- */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 4 }}>
          <Text variant="overline" color="secondary">Set up the next cycle</Text>
          {latestCycle ? (
            <Pressable onPress={onCopySettings} style={{ backgroundColor: copied ? intent.success.soft : semantic.surfaceAlt, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 }}>
              <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: copied ? intent.success.text : semantic.brandDark }}>
                {copied ? 'Copied' : `Copy ${latestCycle.name} settings`}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 18 }}>
          {/* 1 — basics */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>1</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>The basics</Text>
            </View>
            <View style={[cardStyle, { padding: 4 }]}>
              <View style={{ padding: 13 }}>
                <Label>Cycle name</Label>
                <TextInput value={name} onChangeText={setName} placeholder="e.g. 2027 Cycle" placeholderTextColor={semantic.textMuted} style={inputStyle} />
              </View>
              <View style={{ flexDirection: 'row', paddingHorizontal: 13, gap: 12 }}>
                <View style={{ flex: 1 }}><DateInput label="Start date" value={start} onChange={setStart} /></View>
                <View style={{ flex: 1 }}><DateInput label="End date" value={end} onChange={setEnd} minimumDate={parseIsoDate(start) ?? undefined} /></View>
              </View>
              <Text variant="caption" color="secondary" style={{ paddingHorizontal: 13, paddingBottom: 13, lineHeight: 16 }}>
                Contributions are collected monthly.
              </Text>
            </View>
          </View>

          {/* 2 — contributions */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>2</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>Contributions</Text>
            </View>
            <View style={[cardStyle, { padding: 13, gap: 13 }]}>
              <View>
                <Label>Amount per head</Label>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="₱1,000" placeholderTextColor={semantic.textMuted} style={inputStyle} />
              </View>
              <View>
                <Label>Due day</Label>
                <TextInput value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 20" placeholderTextColor={semantic.textMuted} style={inputStyle} />
              </View>
              <View>
                <Label>Late penalty (₱, flat per contribution)</Label>
                <TextInput value={penalty} onChangeText={setPenalty} keyboardType="numeric" placeholder="e.g. 150" placeholderTextColor={semantic.textMuted} style={inputStyle} />
              </View>
            </View>
          </View>

          {/* 3 — lending */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>3</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>Lending</Text>
            </View>
            <View style={[cardStyle, { padding: 13, gap: 13 }]}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><Label>Interest % / month</Label><TextInput value={interestRate} onChangeText={setInterestRate} keyboardType="numeric" placeholder="e.g. 2" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
                <View style={{ flex: 1 }}><Label>Minimum loan</Label><TextInput value={minLoan} onChangeText={setMinLoan} keyboardType="numeric" placeholder="₱1,000" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
              </View>
            </View>
          </View>

          {/* 4 — leaving early */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>4</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>Leaving early</Text>
            </View>
            <View style={[cardStyle, { padding: 13 }]}>
              <Label>Early-termination penalty (₱)</Label>
              <TextInput value={earlyTermPenalty} onChangeText={setEarlyTermPenalty} keyboardType="numeric" placeholder="e.g. 500" placeholderTextColor={semantic.textMuted} style={inputStyle} />
            </View>
          </View>

        </View>
      </ScrollView>

      <LinearGradient
        colors={['transparent', semantic.background, semantic.background]}
        locations={[0, 0.35, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 26 }}
      >
        <Button label="Create cycle" onPress={onCreate} loading={create.loading} disabled={missing.length > 0} />
        <Text variant="caption" style={{ textAlign: 'center', marginTop: 9, color: missing.length ? intent.warning.text : intent.success.text, fontFamily: 'Poppins_600SemiBold' }}>
          {missing.length
            ? `${missing.length} field${missing.length > 1 ? 's' : ''} still needed: ${missing.map((m) => m.label).join(', ')}`
            : primaryCycle?.status === 'active'
              ? `Ready — this cycle starts when ${primaryCycle.name} closes`
              : 'Ready to create'}
        </Text>
      </LinearGradient>
    </SafeAreaView>
  );
}

