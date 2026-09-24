import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useActiveGroup } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { useSetHeadNames } from '@/features/distribution/distribution.hooks';
import { useApplyLoan, useMemberLoanEligibility } from '@/features/lending/lending.hooks';
import { headLabel, type HeadSlot } from '@/api/lending';

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

function HeadChip({ slot, selected, onPress }: { slot: HeadSlot; selected: boolean; onPress: () => void }) {
  const taken = !!slot.loan_id;
  return (
    <Pressable
      onPress={onPress}
      disabled={taken}
      style={{
        paddingVertical: 9, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1.5,
        borderColor: selected ? semantic.brand : semantic.border,
        backgroundColor: selected ? semantic.surface : taken ? semantic.surfaceAlt : semantic.surface,
        opacity: taken ? 0.55 : 1,
      }}
    >
      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: selected ? semantic.brandDark : semantic.textPrimary }}>
        {headLabel(slot.head_no, slot.name, 'Head 1 · You')}
      </Text>
      {taken ? <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>Has a loan</Text> : null}
    </Pressable>
  );
}

export default function RequestLoan() {
  const { groupId, head } = useLocalSearchParams<{ groupId: string; head?: string }>();
  const router = useRouter();
  const apply = useApplyLoan(groupId!);
  const eligibility = useMemberLoanEligibility(groupId!);
  const { cycle } = useActiveCycle(groupId!);

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [term, setTerm] = useState('6');

  // One loan per head — default to the head the hub passed in, else the first free one.
  const slots = eligibility.data?.slots ?? [];
  const firstFree = slots.find((sl) => !sl.loan_id)?.head_no ?? 1;
  const [pickedHead, setPickedHead] = useState<number | null>(head ? Number(head) : null);
  const headNo = pickedHead != null && slots.some((sl) => sl.head_no === pickedHead && !sl.loan_id) ? pickedHead : firstFree;

  // A loan for someone you carry needs their name — saved onto that head, so
  // it also shows as "Head 2 · Pedro" everywhere else. Head 1 is you.
  const { membership } = useActiveGroup();
  const { member } = useAuth();
  const saveNames = useSetHeadNames(groupId!);
  const [nameDraft, setNameDraft] = useState<Record<number, string>>({});
  const savedName = slots.find((sl) => sl.head_no === headNo)?.name ?? '';
  const borrowerName = nameDraft[headNo] ?? savedName;

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
    if (headNo > 1) {
      const name = borrowerName.trim();
      if (!name) return Alert.alert('Name required', `Enter the name of the person this loan is for.`);
      if (name !== savedName && membership) {
        const saved = await saveNames.run(membership.id, { [headNo]: name });
        if (saved === undefined) return Alert.alert('Could not save the name', saveNames.error?.message ?? 'Try again.');
      }
    }
    const ok = await apply.run({ principal: amt, term_months: months, purpose: purpose || undefined, head_no: headNo });
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
        <CloseHeader title="Request a loan" onClose={() => router.back()} />
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
      <CloseHeader title="Request a loan" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Which head ---------------- */}
        {slots.length > 1 ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {slots.map((sl) => (
                <HeadChip key={sl.head_no} slot={sl} selected={sl.head_no === headNo} onPress={() => setPickedHead(sl.head_no)} />
              ))}
            </View>
          </>
        ) : null}

        {/* ---------------- Loan details ---------------- */}
        <SectionHead title="Loan details" />
        <View style={{ gap: 0 }}>
          {headNo > 1 ? (
            <Field
              label={`Name (Head ${headNo})`}
              placeholder="Who is this loan for?"
              value={borrowerName}
              onChangeText={(t) => setNameDraft((d) => ({ ...d, [headNo]: t }))}
              maxLength={80}
            />
          ) : (
            <Field label="Name (Head 1)" value={member?.full_name ?? 'You'} editable={false} />
          )}
          <View>
            <Field label="Loan amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 15 }}>
              <Wallet size={13} color={semantic.textMuted} />
              <Text variant="caption" color="muted">
                {eligibility.loading ? 'Checking fund cash…' : `${formatPeso(availableCash)} available in the fund right now`}
              </Text>
            </View>
            {overCapacity ? (
              <Text variant="caption" style={{ color: intent.warning.text, marginTop: -11, marginBottom: 15 }}>
                This is more than the fund currently has on hand — the Organizer may need to approve a smaller amount.
              </Text>
            ) : null}
          </View>
          <Field label="Purpose" placeholder="e.g. Sari-sari store restock" value={purpose} onChangeText={setPurpose} />
          <Field label="Requested term (months)" value={term} onChangeText={setTerm} keyboardType="number-pad" />
        </View>

        {/* ---------------- Loan terms ---------------- */}
        <SectionHead title="Loan terms" />
        <View style={[{ backgroundColor: semantic.card, borderRadius: 14, overflow: 'hidden' }, shadowToken.soft]}>
          <TermRow k="Principal / month" v={formatPeso(perMonth)} />
          <TermRow k="Interest rate" v={hasCycleRate ? `${ratePct!.toFixed(2)}% / month` : 'Set by the Organizer at approval'} muted={!hasCycleRate} />
          <TermRow k="Est. interest (month 1)" v={amortization ? formatPeso(amortization.firstMonthInterest) : '—'} muted={!amortization} />
          <TermRow k="Est. total repayable" v={amortization ? formatPeso(amortization.totalRepayable) : 'Depends on approved rate'} muted={!amortization} />
        </View>

        <Button label="Submit request" onPress={onSubmit} loading={apply.loading || saveNames.loading} style={{ marginTop: 18 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
