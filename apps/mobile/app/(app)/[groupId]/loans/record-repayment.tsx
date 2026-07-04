/**
 * app/(app)/[groupId]/loans/record-repayment.tsx — treasurer records loan
 * repayments (M6). Lists active loans; recording posts via recordRepayment
 * (interest-first allocation happens server-side).
 */
import { useState } from 'react';
import { View, ScrollView, Modal, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { X, Repeat } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { useLoans, useRecordRepayment } from '@/features/lending/lending.hooks';
import type { Loan } from '@/api/lending';

function nameOf(l: any) { return l.borrower_name ?? l.member_name ?? l.members?.full_name ?? 'Member'; }

export default function RecordRepayment() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const loans = useLoans(groupId!, { status: 'active' });
  const repay = useRecordRepayment(groupId!);
  const [target, setTarget] = useState<Loan | null>(null);
  const [amount, setAmount] = useState('');

  const list = loans.data ?? [];

  async function confirm() {
    if (!target) return;
    const amt = toAmountString(amount);
    if (!amt || Number(amt) <= 0) return Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
    const ok = await repay.run(target.id, { amount: amt });
    if (ok !== undefined) { setTarget(null); setAmount(''); loans.refetch(); Alert.alert('Recorded', 'Repayment recorded.'); }
    else if (repay.error) Alert.alert('Could not record', repay.error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Repayments" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {loans.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} /> :
        list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 16 }}>No active loans</Text>
            <Text variant="body" color="secondary">Nothing to record right now.</Text>
          </View>
        ) : list.map((l) => {
          const outstanding = Number(l.outstanding_balance ?? 0);
          const principal = Number(l.principal ?? 0);
          const pct = principal ? Math.max(0, Math.min(100, Math.round((1 - outstanding / principal) * 100))) : 0;
          return (
            <View key={l.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <Avatar name={nameOf(l)} size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" style={{ fontSize: 14.5 }}>{nameOf(l)}</Text>
                  <Text variant="caption" color="secondary">Original {formatPeso(principal)} · {l.term_months} mo</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(outstanding)}</Text>
                  <Text variant="caption" color="secondary">remaining</Text>
                </View>
              </View>
              <View style={{ height: 7, backgroundColor: semantic.borderStrong, borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                <View style={{ width: (pct + '%') as any, height: '100%', backgroundColor: semantic.brand, borderRadius: 999 }} />
              </View>
              <Button label="Record repayment" leading={<Repeat size={15} color="#fff" />} onPress={() => { setTarget(l); setAmount(''); }} style={{ paddingVertical: 11 }} />
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!target} transparent animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="h2" style={{ flex: 1, fontSize: 18 }}>Record repayment</Text>
              <Pressable onPress={() => setTarget(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {target && (
              <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="label">{nameOf(target)}</Text>
                <Text variant="label">{formatPeso(target.outstanding_balance)} left</Text>
              </View>
            )}
            <View style={{ gap: 7 }}>
              <Text variant="overline" color="secondary">Amount</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="₱0" placeholderTextColor={semantic.textMuted} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: semantic.textPrimary }} />
            </View>
            <Button label="Confirm repayment" onPress={confirm} loading={repay.loading} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
