/**
 * app/(app)/[groupId]/request-loan.tsx — member requests a loan (M6).
 * Wired to useApplyLoan. Interest is NOT set here — the organizer sets it at
 * approval — so the repayment preview shows principal + per-month estimate with
 * a clear note. Available-fund is NOT shown to members (liquidity is officer-
 * only in our RBAC).
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useApplyLoan } from '@/features/lending/lending.hooks';

export default function RequestLoan() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const apply = useApplyLoan(groupId!);

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [term, setTerm] = useState('6');

  const verified = member?.verification_status === 'verified';
  const principal = Number(toAmountString(amount) ?? 0);
  const months = Number(term) || 0;
  const perMonth = useMemo(() => (principal && months ? principal / months : 0), [principal, months]);

  async function onSubmit() {
    if (!verified) return Alert.alert('Verification required', 'You need a verified account to request a loan.');
    const amt = toAmountString(amount);
    if (!amt || Number(amt) <= 0) return Alert.alert('Invalid amount', 'Enter a valid loan amount.');
    if (!months) return Alert.alert('Invalid term', 'Enter the number of months.');
    const ok = await apply.run({ principal: amt, term_months: months, purpose: purpose || undefined });
    if (ok !== undefined) {
      Alert.alert('Request sent', 'Your loan request was submitted. The organizer will decide.');
      router.replace({ pathname: '/(app)/[groupId]', params: { groupId } });
    } else if (apply.error) {
      Alert.alert('Could not submit', apply.error.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Request Loan" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Standing */}
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 14, gap: 4, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <ShieldCheck size={17} color={verified ? '#3E8E66' : '#A87C2C'} />
            <Text variant="caption" color="secondary">Standing</Text>
          </View>
          <Text variant="label" style={{ fontSize: 16, color: verified ? '#3E8E66' : '#A87C2C' }}>{verified ? 'Eligible' : 'Verify to borrow'}</Text>
        </View>

        <Field label="Loan amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Field label="Purpose" placeholder="e.g. Sari-sari store restock" value={purpose} onChangeText={setPurpose} />
        <Field label="Requested term (months)" value={term} onChangeText={setTerm} keyboardType="number-pad" />

        <Text variant="h3" style={{ fontSize: 15, marginTop: 8, marginBottom: 12 }}>Repayment preview</Text>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 14, overflow: 'hidden', marginBottom: 8 }, shadowToken.card]}>
          {[
            ['Loan amount', formatPeso(principal)],
            ['Term', `${months} month${months === 1 ? '' : 's'}`],
            ['Principal / month', formatPeso(perMonth)],
          ].map(([k, v], i, a) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: i < a.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <Text variant="body" color="secondary">{k}</Text>
              <Text variant="label">{v}</Text>
            </View>
          ))}
        </View>
        <Text variant="caption" color="muted" style={{ marginBottom: 14 }}>
          Interest and the total repayable are finalized by the organizer when the loan is approved.
        </Text>

        <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <ShieldCheck size={18} color={semantic.brandDark} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>The organizer makes the final lending decision.</Text>
        </View>

        <Button label="Submit request" onPress={onSubmit} loading={apply.loading} disabled={!verified} />
      </ScrollView>
    </SafeAreaView>
  );
}
