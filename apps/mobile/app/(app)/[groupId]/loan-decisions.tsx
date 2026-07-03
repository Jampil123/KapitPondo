/**
 * app/(app)/[groupId]/loan-decisions.tsx
 * ----------------------------------------------------------------------------
 * Owner's lending decisions (designer layout, wired to our API):
 *   fund balance → useLiquidity        tabs → useLoans(status)
 *   approve      → approveLoan(id, monthlyRate)   reject → rejectLoan(id, note)
 *
 * NOTE vs the prototype: our approve is APPROVE + DISBURSE fused and REQUIRES a
 * monthly interest rate, so the approve sheet collects it (the prototype only
 * took a note). We also check liquidity ≥ principal before allowing approve.
 */
import { useState } from 'react';
import { View, Modal, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Wallet, Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { TabBar } from '@/components/ui/TabBar';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLoans, useLiquidity, useApproveLoan, useRejectLoan } from '@/features/lending/lending.hooks';
import type { Loan, LoanStatus } from '@/api/lending';

function loanName(l: any): string {
  return l.member_name ?? l.members?.full_name ?? l.member?.full_name ?? 'Member';
}

export default function LoanDecisions() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [tab, setTab] = useState<LoanStatus>('pending');

  const liquidity = useLiquidity(groupId!);
  const pendingList = useLoans(groupId!, { status: 'pending' });
  const tabList = useLoans(groupId!, { status: tab });
  const approve = useApproveLoan(groupId!);
  const reject = useRejectLoan(groupId!);

  const [target, setTarget] = useState<Loan | null>(null); // loan being approved
  const [rate, setRate] = useState('3'); // monthly % as typed
  const available = Number(liquidity.data?.available_cash ?? 0);

  async function confirmApprove() {
    if (!target) return;
    const pct = Number(rate);
    if (!Number.isFinite(pct) || pct <= 0) { Alert.alert('Interest rate', 'Enter a valid monthly interest rate (e.g. 3 for 3%).'); return; }
    if (available && Number(target.principal) > available) {
      Alert.alert('Insufficient funds', `The fund has ${formatPeso(available)} available, but this loan is ${formatPeso(target.principal)}.`);
      return;
    }
    const ok = await approve.run(target.id, pct / 100); // API wants a decimal (0.03)
    if (ok !== undefined) { setTarget(null); pendingList.refetch(); tabList.refetch(); liquidity.refetch(); }
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }

  function confirmReject(l: Loan) {
    Alert.alert('Reject loan', `Reject ${loanName(l)}'s request for ${formatPeso(l.principal)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        const ok = await reject.run(l.id);
        if (ok !== undefined) { tabList.refetch(); pendingList.refetch(); }
        else if (reject.error) Alert.alert('Could not reject', reject.error.message);
      }},
    ]);
  }

  const list = tabList.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Loan Decisions" subtitle="Organizer" />
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        {/* Fund balance */}
        <View style={{ backgroundColor: semantic.textPrimary, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" style={{ color: '#fff', opacity: 0.7 }}>Available fund balance</Text>
            {liquidity.loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(available)}</Text>}
          </View>
          <Wallet size={26} color="rgba(255,255,255,0.8)" />
        </View>

        <TabBar<LoanStatus>
          options={[{ key: 'pending', label: 'Pending', count: pendingList.data?.length ?? 0 }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }]}
          value={tab}
          onChange={setTab}
        />

        {tabList.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} />
        ) : list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 16 }}>Nothing here</Text>
            <Text variant="body" color="secondary">No {tab} loan requests.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {list.map((l) => (
              <View key={l.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  <Avatar name={loanName(l)} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label" style={{ fontSize: 14.5 }}>{loanName(l)}</Text>
                    <Text variant="caption" color="secondary">{l.purpose ?? '—'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(l.principal)}</Text>
                    <Text variant="caption" color="secondary">{l.term_months} mo</Text>
                  </View>
                </View>
                {l.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => { setTarget(l); setRate('3'); }} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#EAF2F6', borderRadius: 12, paddingVertical: 11 }}>
                      <Check size={16} color="#5E8497" strokeWidth={2.4} />
                      <Text variant="label" style={{ color: '#5E8497', fontSize: 13.5 }}>Approve</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmReject(l)} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#F7E5E5', borderRadius: 12, paddingVertical: 11 }}>
                      <X size={16} color="#C25C5E" strokeWidth={2.4} />
                      <Text variant="label" style={{ color: '#C25C5E', fontSize: 13.5 }}>Reject</Text>
                    </Pressable>
                  </View>
                ) : (
                  <StatusBadge entity="loan" value={l.status} />
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Approve sheet — collects the monthly interest rate our API requires */}
      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <Pressable onPress={() => setTarget(null)} style={{ flex: 1, backgroundColor: 'rgba(42,62,75,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
            <Text variant="h2" style={{ fontSize: 18 }}>Approve & disburse loan</Text>
            {target ? (
              <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label">{loanName(target)}</Text>
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(target.principal)}</Text>
                </View>
                <Text variant="caption" color="secondary">{target.purpose} · {target.term_months} months</Text>
              </View>
            ) : null}
            <View style={{ gap: 7 }}>
              <Text variant="overline" color="secondary">Monthly interest rate (%)</Text>
              <TextInput value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="3" placeholderTextColor={semantic.textMuted} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontFamily: 'Poppins_400Regular', fontSize: 15, color: semantic.textPrimary }} />
              <Text variant="caption" color="muted">e.g. 3 = 3% per month. This approves AND disburses the loan.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setTarget(null)} style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: semantic.border }}>
                <Text variant="label" color="secondary">Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmApprove} disabled={approve.loading} style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: semantic.brand }}>
                {approve.loading ? <ActivityIndicator color="#fff" /> : <Text variant="label" style={{ color: '#fff' }}>Approve & disburse</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
