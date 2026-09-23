import { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useApplyLoan, useMemberLoanEligibility } from '@/features/lending/lending.hooks';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

function SectionHead({ title }: { title: string }) {
  return (
    <View style={{ marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
    </View>
  );
}

function TermRow({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
      <Text variant="body" color="secondary">{k}</Text>
      <Text variant="label" style={muted ? { color: semantic.textMuted, fontStyle: 'italic' } : undefined}>{v}</Text>
    </View>
  );
}

export default function RequestLoan() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const apply = useApplyLoan(groupId!);
  const eligibility = useMemberLoanEligibility(groupId!);
  const { cycle } = useActiveCycle(groupId!);

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [term, setTerm] = useState('6');

  const availableCash = Number(eligibility.data?.available_cash ?? 0);
  const principal = Number(toAmountString(amount) ?? 0);
  const months = Number(term) || 0;
  const perMonth = useMemo(() => (principal && months ? principal / months : 0), [principal, months]);
  const overCapacity = principal > 0 && principal > availableCash;

  // The cycle can configure a default monthly rate at cycle creation
  // (cycles/configure.tsx, cycle.default_interest_rate) — the Owner can
  // still adjust it per loan at approval, but it's real, already-entered
  // data, so the estimate below is sourced from it rather than left vague.
  const hasCycleRate = cycle?.default_interest_rate != null;
  const monthlyRate = hasCycleRate ? Number(cycle!.default_interest_rate) : 0;
  const ratePct = hasCycleRate ? monthlyRate * 100 : null;

  // Flat monthly rate on the original principal — "3% per month" here means
  // 3% of the full loan amount each month (not a declining balance), so a
  // ₱1,000 loan at 3% for 2 months is ₱30/month × 2 = ₱60 interest, ₱1,060
  // total. This is a projection for display only; the Owner still confirms
  // the actual rate/schedule at approval.
  const amortization = useMemo(() => {
    if (!hasCycleRate || !principal || !months) return null;
    const perMonthInterest = principal * monthlyRate;
    const totalInterest = perMonthInterest * months;
    return { firstMonthInterest: perMonthInterest, totalInterest, totalRepayable: principal + totalInterest };
  }, [hasCycleRate, monthlyRate, principal, months]);

  async function onSubmit() {
    const amt = toAmountString(amount);
    if (!amt || Number(amt) <= 0) return Alert.alert('Invalid amount', 'Enter a valid loan amount.');
    if (!months) return Alert.alert('Invalid term', 'Enter the number of months.');
    const ok = await apply.run({ principal: amt, term_months: months, purpose: purpose || undefined });
    if (ok !== undefined) {
      router.replace({ pathname: '/(app)/[groupId]/loans', params: { groupId } });
    } else if (apply.error) {
      Alert.alert('Could not submit', apply.error.message);
    }
  }

  // The "+" sheet reaches this form directly, so it enforces the same eligibility gate as the loans overview.
  if (eligibility.data && !eligibility.data.eligible) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Request Loan" />
        <View style={{ padding: 16, gap: 14 }}>
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, CARD_SHADOW]}>
            <Text variant="label">You can&apos;t request a loan yet</Text>
          </View>
          <Button label="See what's blocking you" onPress={() => router.replace({ pathname: '/(app)/[groupId]/loans', params: { groupId } })} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Request Loan" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Loan details ---------------- */}
        <SectionHead title="Loan details" />
        <View style={{ gap: 14 }}>
          <View>
            <Field label="Loan amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Wallet size={13} color={semantic.textMuted} />
              <Text variant="caption" color="muted">
                {eligibility.loading ? 'Checking fund cash…' : `${formatPeso(availableCash)} available in the fund right now`}
              </Text>
            </View>
            {overCapacity ? (
              <Text variant="caption" style={{ color: intent.warning.text, marginTop: 4 }}>
                This is more than the fund currently has on hand — the Organizer may need to approve a smaller amount.
              </Text>
            ) : null}
          </View>
          <Field label="Purpose" placeholder="e.g. Sari-sari store restock" value={purpose} onChangeText={setPurpose} />
          <Field label="Requested term (months)" value={term} onChangeText={setTerm} keyboardType="number-pad" />
        </View>

        {/* ---------------- Loan terms ---------------- */}
        <SectionHead title="Loan terms" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 14, overflow: 'hidden' }, CARD_SHADOW]}>
          <TermRow k="Principal / month" v={formatPeso(perMonth)} />
          <TermRow k="Interest rate" v={hasCycleRate ? `${ratePct!.toFixed(2)}% / month` : 'Set by the Organizer at approval'} muted={!hasCycleRate} />
          <TermRow k="Est. interest (month 1)" v={amortization ? formatPeso(amortization.firstMonthInterest) : '—'} muted={!amortization} />
          <TermRow k="Est. total repayable" v={amortization ? formatPeso(amortization.totalRepayable) : 'Depends on approved rate'} muted={!amortization} />
        </View>

        <Button label="Submit request" onPress={onSubmit} loading={apply.loading} style={{ marginTop: 18 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
