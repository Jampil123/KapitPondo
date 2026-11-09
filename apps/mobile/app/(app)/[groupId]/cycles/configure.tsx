import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { AlertTriangle, Lock } from 'lucide-react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateInput, formatDisplayDate, parseIsoDate } from '@/components/shared/DateInput';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { useActiveGroup } from '@/context/GroupContext';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { toAmountString, formatPeso } from '@/lib/money';
import { useQuery } from '@/hooks/useApi';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { listDistributions } from '@/api/distribution';
import { selectActiveCycle } from '@/api/cycles';
import { useCycles, useCreateCycle, useActivateCycle, useCloseCycle, useCycleProgress, useCloseBlockers } from '@/features/cycles/cycles.hooks';
import type { Cycle } from '@/api/cycles';
import { CoachMark, type TargetRect } from '@/features/onboarding/CoachMark';
import { CYCLE_TOUR_TOTAL, measureRef } from '@/features/onboarding/CycleSetupTour';

type FormSection = 'basics' | 'contributions' | 'lending' | 'leaving';
// Steps 2–6 of the Organizer cycle-setup tour (step 1 is on the dashboard, 7 is Activate).
const FORM_TOUR: { key: FormSection | 'create'; title: string; body: string }[] = [
  { key: 'basics', title: 'Name and dates', body: 'Name the cycle and pick its start date. End date is optional.' },
  { key: 'contributions', title: 'Contributions', body: 'Amount each head pays monthly, the due day, and the late fee.' },
  { key: 'lending', title: 'Lending', body: 'Loan interest, minimum amount and late penalty. Optional.' },
  { key: 'leaving', title: 'Leaving early', body: 'Penalty if a member leaves mid-cycle. Optional.' },
  { key: 'create', title: 'Create the cycle', body: 'Fill in name, start date and amount, then tap here. Your first cycle starts right away.' },
];

function Label({ children }: { children: string }) {
  return <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 4 }}>{children}</Text>;
}
const inputStyle = { backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 52, fontFamily: 'Poppins_400Regular', fontSize: 14, color: semantic.textPrimary };


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

// UC-FC-02 step 3 / A1: close and set up the next cycle, or close only.
function CloseCycleSheet({ visible, cycleName, loading, onCloseAndNext, onCloseOnly, onCancel }: {
  visible: boolean; cycleName: string; loading: boolean;
  onCloseAndNext: () => void; onCloseOnly: () => void; onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.45)', justifyContent: 'flex-end' }} onPress={loading ? undefined : onCancel}>
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 22 + insets.bottom, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: intent.primary.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
            <Lock size={24} color={intent.primary.text} />
          </View>
          <Text variant="h3" style={{ fontSize: 17, textAlign: 'center' }}>Close {cycleName}?</Text>
          <Text color="secondary" style={{ fontSize: 13.5, textAlign: 'center' }}>
            Its records become read-only and every member is notified. Members and their heads stay in the group.
          </Text>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 10 }}>
            <Button label="Close and set up next cycle" onPress={onCloseAndNext} loading={loading} />
            <Button label="Close only" variant="ghost" onPress={onCloseOnly} disabled={loading} />
            <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={loading} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ConfigureCycle() {
  const { groupId, tour } = useLocalSearchParams<{ groupId: string; tour?: string }>();
  const router = useRouter();
  const keyboardVisible = useKeyboardVisible();
  const cycles = useCycles(groupId!);
  const create = useCreateCycle(groupId!);
  const activate = useActivateCycle(groupId!);
  const close = useCloseCycle(groupId!);
  const distributions = useQuery(() => listDistributions(groupId!), [groupId], { table: 'distributions', filter: `group_id=eq.${groupId}` });
  const { role } = useActiveGroup();
  const isOrganizer = role === 'owner';
  const scrollRef = useRef<ScrollView>(null);
  const formY = useRef(0);
  const [closeSheet, setCloseSheet] = useState(false);

  const allCycles = cycles.data ?? [];
  const primaryCycle = selectActiveCycle(allCycles) ?? allCycles.find((c) => c.status === 'draft') ?? null;
  const otherCycles = allCycles.filter((c) => c.id !== primaryCycle?.id);
  const latestCycle = allCycles[0] ?? null; // listCycles returns newest first
  const cycleDistribution = primaryCycle
    ? (distributions.data ?? []).find((d) => d.cycle_id === primaryCycle.id && d.status === 'finalized')
      ?? (distributions.data ?? []).find((d) => d.cycle_id === primaryCycle.id && d.status !== 'draft' && d.status !== 'returned')
      ?? null
    : null;
  const activeId = primaryCycle?.status === 'active' ? primaryCycle.id : undefined;
  const progress = useCycleProgress(groupId!, activeId);
  const blockers = useCloseBlockers(groupId!, activeId);
  const pending = (blockers.data ?? []).filter((b) => b.kind !== 'distribution');
  const canClose = !!activeId && !blockers.loading && !blockers.error && (blockers.data ?? []).length === 0;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [penalty, setPenalty] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [minLoan, setMinLoan] = useState('');
  const [earlyTermPenalty, setEarlyTermPenalty] = useState('');
  const [loanLatePenalty, setLoanLatePenalty] = useState('');
  const [copied, setCopied] = useState(false);

  const missing = [
    { label: 'name', ok: !!name.trim() },
    { label: 'start date', ok: !!start.trim() },
    { label: 'amount', ok: !!toAmountString(amount) },
  ].filter((f) => !f.ok);

  /* ---------------- Onboarding tour ---------------- */
  const formBodyY = useRef(0);
  const sectionY = useRef<Partial<Record<FormSection, number>>>({});
  const sectionRefs = {
    basics: useRef<View>(null),
    contributions: useRef<View>(null),
    lending: useRef<View>(null),
    leaving: useRef<View>(null),
  };
  const createBtnRef = useRef<View>(null);
  const [tourIdx, setTourIdx] = useState<number | null>(null);
  const [tourTarget, setTourTarget] = useState<TargetRect | null>(null);
  const tourStarted = useRef(false);
  // No "Activate" step: a group's first cycle is created already active
  // (cycles.service createCycle), so creating it is the tour's last step.

  useEffect(() => {
    if (tour === '1' && isOrganizer && !tourStarted.current && !cycles.loading && allCycles.length === 0) {
      tourStarted.current = true;
      setTourIdx(0);
    }
  }, [tour, isOrganizer, cycles.loading, allCycles.length]);

  useEffect(() => {
    if (tourIdx === null) return;
    setTourTarget(null);
    const step = FORM_TOUR[tourIdx];
    if (step.key === 'create') {
      const t = setTimeout(() => measureRef(createBtnRef, setTourTarget), 50);
      return () => clearTimeout(t);
    }
    const key = step.key;
    const y = formBodyY.current + (sectionY.current[key] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    const t = setTimeout(() => measureRef(sectionRefs[key], setTourTarget), 400);
    return () => clearTimeout(t);
  }, [tourIdx]);

  function nextTourStep() {
    setTourIdx((i) => (i === null || i >= FORM_TOUR.length - 1 ? null : i + 1));
  }

  // Once a cycle exists, the form below is only for the NEXT one — so the
  // bottom bar (button + "fields still needed") stays hidden until the
  // Organizer actually starts filling it in.
  const formPristine = ![name, amount, start, end, penalty, dueDay, interestRate, minLoan, loanLatePenalty, earlyTermPenalty].some((v) => v.trim());

  function copySettingsFrom(c: Cycle) {
    setAmount(String(c.contribution_amount ?? ''));
    setPenalty(c.penalty_amount ? String(c.penalty_amount) : '');
    setDueDay(c.contribution_due_day ? String(c.contribution_due_day) : '');
    setInterestRate(c.default_interest_rate ? String(Number(c.default_interest_rate) * 100) : '');
    setMinLoan(c.minimum_loan_amount ? String(c.minimum_loan_amount) : '');
    setEarlyTermPenalty(c.early_termination_penalty ? String(c.early_termination_penalty) : '');
    setLoanLatePenalty(c.loan_late_penalty_pct ? String(Number(c.loan_late_penalty_pct)) : '');
  }

  function onCopySettings() {
    if (!latestCycle) return;
    copySettingsFrom(latestCycle);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function onCreate() {
    if (missing.length) {
      Alert.alert('Missing info', 'Name, start date, and contribution amount are required.');
      return;
    }
    const day = dueDay ? Number(dueDay) : undefined;
    const latePct = loanLatePenalty.trim() ? Number(loanLatePenalty) : null;
    if (latePct != null && (isNaN(latePct) || latePct < 0 || latePct > 100)) {
      Alert.alert('Invalid late penalty', 'Enter a loan late penalty between 0 and 100%.');
      return;
    }
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
      loan_late_penalty_pct: loanLatePenalty ? String(Number(loanLatePenalty)) : undefined,
    });
    if (ok !== undefined) {
      const createdName = name.trim();
      toast(`${createdName} created`);
      // Back to the top, where the new cycle's card (and its Activate button) is.
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setName(''); setAmount(''); setStart(''); setEnd(''); setPenalty('');
      setDueDay(''); setInterestRate(''); setMinLoan(''); setEarlyTermPenalty(''); setLoanLatePenalty('');
      cycles.refetch();
    } else if (create.error) {
      Alert.alert('Could not create cycle', create.error.message);
    }
  }

  async function onActivate(id: string) {
    const ok = await activate.run(id);
    if (ok !== undefined) {
      const c = allCycles.find((x) => x.id === id);
      toast(`${c?.name ?? 'Cycle'} is now active`);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      cycles.refetch();
    }
    else if (activate.error) Alert.alert('Could not activate', activate.error.status === 409 || /active/i.test(activate.error.message) ? 'Close the current active cycle first — only one can be active at a time.' : activate.error.message);
  }
  async function onClose(openNext: boolean) {
    if (!primaryCycle) return;
    const closing = primaryCycle;
    const ok = await close.run(closing.id);
    setCloseSheet(false);
    if (ok === undefined) {
      blockers.refetch();
      if (close.error) Alert.alert('Could not close the cycle', close.error.message);
      return;
    }
    cycles.refetch();
    if (openNext) {
      // Steps 4-5: the next cycle starts from this one's settings; members and heads carry over on their own.
      copySettingsFrom(closing);
      toast(`${closing.name} closed. Set up the next cycle.`);
      setTimeout(() => scrollRef.current?.scrollTo({ y: formY.current, animated: true }), 250);
    } else {
      toast(`${closing.name} closed`);
    }
  }
  function goToYearEnd() {
    router.push({ pathname: '/(app)/[groupId]/distribution/year-end' as any, params: { groupId } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Configure Cycle" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: keyboardVisible || (primaryCycle && formPristine) ? 32 : 130, gap: 8 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >

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

              {/* Cycle summary */}
              {primaryCycle.status === 'active' && progress.data ? (
                <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: semantic.surface, borderRadius: 12, padding: 11 }}>
                    <Text variant="caption" color="secondary">Collected</Text>
                    <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(progress.data.collected_total)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: semantic.surface, borderRadius: 12, padding: 11 }}>
                    <Text variant="caption" color="secondary">Expected</Text>
                    <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(progress.data.expected_total)}</Text>
                  </View>
                  <View style={{ width: 70, backgroundColor: semantic.surface, borderRadius: 12, padding: 11 }}>
                    <Text variant="caption" color="secondary">Paid</Text>
                    <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{Math.round(Number(progress.data.percent_collected))}%</Text>
                  </View>
                </View>
              ) : null}

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

                    {pending.length > 0 ? (
                      <View style={{ backgroundColor: intent.warning.soft, borderRadius: 12, padding: 12, gap: 5 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <AlertTriangle size={14} color={intent.warning.text} />
                          <Text variant="label" style={{ fontSize: 12.5, color: intent.warning.text }}>Still waiting for a decision</Text>
                        </View>
                        {pending.map((b) => (
                          <Text key={b.kind} variant="caption" style={{ color: intent.warning.text, lineHeight: 16 }}>• {b.label}</Text>
                        ))}
                      </View>
                    ) : null}

                    {cycleDistribution?.status !== 'finalized' ? (
                      <Button label="Go to Year-End Distribution" variant="ghost" onPress={goToYearEnd} style={{ paddingVertical: 11 }} />
                    ) : null}
                    {isOrganizer ? (
                      <Button label="Close cycle" onPress={() => setCloseSheet(true)} disabled={!canClose} style={{ paddingVertical: 11 }} />
                    ) : (
                      <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>Only the Organizer can close the cycle.</Text>
                    )}
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
        <View onLayout={(e) => { formY.current = e.nativeEvent.layout.y; }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: primaryCycle || otherCycles.length > 0 ? 22 : 0, marginBottom: 4 }}>
          <Text variant="overline" color="secondary">Set up the next cycle</Text>
          {latestCycle ? (
            <Pressable onPress={onCopySettings} style={{ backgroundColor: copied ? intent.success.soft : semantic.surfaceAlt, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 }}>
              <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: copied ? intent.success.text : semantic.brandDark }}>
                {copied ? 'Copied' : `Copy ${latestCycle.name} settings`}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View onLayout={(e) => { formBodyY.current = e.nativeEvent.layout.y; }} style={{ gap: 18 }}>
          {/* 1 — basics */}
          <View ref={sectionRefs.basics} collapsable={false} onLayout={(e) => { sectionY.current.basics = e.nativeEvent.layout.y; }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>1</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>The basics</Text>
            </View>
            <View>
              <View style={{ paddingBottom: 13 }}>
                <Label>Cycle name</Label>
                <TextInput value={name} onChangeText={setName} placeholder="e.g. 2027 Cycle" placeholderTextColor={semantic.textMuted} style={inputStyle} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><DateInput label="Start date" value={start} onChange={setStart} /></View>
                <View style={{ flex: 1 }}><DateInput label="End date" value={end} onChange={setEnd} minimumDate={parseIsoDate(start) ?? undefined} /></View>
              </View>
              <Text variant="caption" color="secondary" style={{ lineHeight: 16 }}>
                Contributions are collected monthly.
              </Text>
            </View>
          </View>

          {/* 2 — contributions */}
          <View ref={sectionRefs.contributions} collapsable={false} onLayout={(e) => { sectionY.current.contributions = e.nativeEvent.layout.y; }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>2</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>Contributions</Text>
            </View>
            <View style={{ gap: 13 }}>
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
          <View ref={sectionRefs.lending} collapsable={false} onLayout={(e) => { sectionY.current.lending = e.nativeEvent.layout.y; }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>3</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>Lending</Text>
            </View>
            <View style={{ gap: 13 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><Label>Interest % / month</Label><TextInput value={interestRate} onChangeText={setInterestRate} keyboardType="numeric" placeholder="e.g. 2" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
                <View style={{ flex: 1 }}><Label>Minimum loan</Label><TextInput value={minLoan} onChangeText={setMinLoan} keyboardType="numeric" placeholder="₱1,000" placeholderTextColor={semantic.textMuted} style={inputStyle} /></View>
              </View>
              <View>
                <Label>Late penalty (% per month late, optional)</Label>
                <TextInput value={loanLatePenalty} onChangeText={setLoanLatePenalty} keyboardType="numeric" placeholder="e.g. 5" placeholderTextColor={semantic.textMuted} style={inputStyle} />
              </View>
            </View>
          </View>

          {/* 4 — leaving early */}
          <View ref={sectionRefs.leaving} collapsable={false} onLayout={(e) => { sectionY.current.leaving = e.nativeEvent.layout.y; }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>4</Text>
              </View>
              <Text variant="h3" style={{ fontSize: 14 }}>Leaving early</Text>
            </View>
            <View>
              <Label>Early-termination penalty (₱)</Label>
              <TextInput value={earlyTermPenalty} onChangeText={setEarlyTermPenalty} keyboardType="numeric" placeholder="e.g. 500" placeholderTextColor={semantic.textMuted} style={inputStyle} />
            </View>
          </View>

        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Hidden while typing — pinned above the keyboard it would cover the field in use. */}
      {keyboardVisible || (primaryCycle && formPristine) ? null : <LinearGradient
        colors={['transparent', semantic.background, semantic.background]}
        locations={[0, 0.35, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 26 }}
      >
        <View ref={createBtnRef} collapsable={false}>
          <Button label="Create cycle" onPress={onCreate} loading={create.loading} disabled={missing.length > 0} />
        </View>
        <Text variant="caption" style={{ textAlign: 'center', marginTop: 9, color: missing.length ? intent.warning.text : intent.success.text, fontFamily: 'Poppins_600SemiBold' }}>
          {missing.length
            ? `${missing.length} field${missing.length > 1 ? 's' : ''} still needed: ${missing.map((m) => m.label).join(', ')}`
            : primaryCycle?.status === 'active'
              ? `Ready — this cycle starts when ${primaryCycle.name} closes`
              : 'Ready to create'}
        </Text>
      </LinearGradient>}

      {tourIdx !== null ? (
        <CoachMark
          visible
          target={tourTarget}
          radius={FORM_TOUR[tourIdx].key === 'create' ? 14 : 16}
          step={tourIdx + 2}
          total={CYCLE_TOUR_TOTAL}
          title={FORM_TOUR[tourIdx].title}
          body={FORM_TOUR[tourIdx].body}
          nextLabel={tourIdx === FORM_TOUR.length - 1 ? 'Got it' : 'Next'}
          onNext={nextTourStep}
          onSkip={() => setTourIdx(null)}
        />
      ) : null}

      <CloseCycleSheet
        visible={closeSheet}
        cycleName={primaryCycle?.name ?? 'this cycle'}
        loading={close.loading}
        onCloseAndNext={() => onClose(true)}
        onCloseOnly={() => onClose(false)}
        onCancel={() => setCloseSheet(false)}
      />
    </SafeAreaView>
  );
}

