/**
 * app/(app)/[groupId]/loan-decisions.tsx
 * ----------------------------------------------------------------------------
 * Owner's lending decisions (designer layout, wired to our API):
 *   fund balance → useLiquidity        tabs → useLoans(status)
 *   approve      → approveLoan(id, monthlyRate)   reject → rejectLoan(id, reason)
 *   disburse     → useDisburseLoan(id) — separate step, shown on Approved loans
 *
 * Approval and disbursement are deliberately two different actions now (see
 * api/lending.ts) — approving sets the rate and moves the loan to "Approved,
 * awaiting disbursement"; a Treasurer or Owner then disburses it separately.
 * We also check liquidity ≥ principal before allowing approve.
 */
import { useState } from 'react';
import { View, Modal, TextInput, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Wallet, Check, X, Banknote } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { TabBar } from '@/components/ui/TabBar';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { useLoans, useLiquidity, useApproveLoan, useDisburseLoan, useRejectLoan } from '@/features/lending/lending.hooks';
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
  const disburse = useDisburseLoan(groupId!);
  const reject = useRejectLoan(groupId!);

  const [target, setTarget] = useState<Loan | null>(null); // loan being approved
  const [rate, setRate] = useState('3'); // monthly % as typed
  const [approvedAmount, setApprovedAmount] = useState(''); // TC-040: may be less than principal
  const [rejectTarget, setRejectTarget] = useState<Loan | null>(null);
  const available = Number(liquidity.data?.available_cash ?? 0);

  function openApprove(l: Loan) {
    setTarget(l);
    setRate('3');
    // Suggest the full amount, or the available cash if that's short — the
    // Owner can still type a different amount either way (TC-040).
    setApprovedAmount(String(available && available < Number(l.principal) ? available : l.principal));
  }

  async function confirmApprove() {
    if (!target) return;
    const pct = Number(rate);
    if (!Number.isFinite(pct) || pct <= 0) { Alert.alert('Interest rate', 'Enter a valid monthly interest rate (e.g. 3 for 3%).'); return; }
    const amt = toAmountString(approvedAmount);
    if (!amt || Number(amt) <= 0) { Alert.alert('Approved amount', 'Enter a valid amount to approve.'); return; }
    if (Number(amt) > Number(target.principal)) { Alert.alert('Approved amount', 'Cannot approve more than the requested principal.'); return; }
    const ok = await approve.run(target.id, pct / 100, amt);
    if (ok !== undefined) { setTarget(null); pendingList.refetch(); tabList.refetch(); liquidity.refetch(); }
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }

  async function confirmDisburse(l: Loan) {
    const ok = await disburse.run(l.id);
    if (ok !== undefined) { tabList.refetch(); liquidity.refetch(); }
    else if (disburse.error) Alert.alert('Could not disburse', disburse.error.message);
  }

  async function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const ok = await reject.run(rejectTarget.id, reason || undefined);
    setRejectTarget(null);
    if (ok !== undefined) { tabList.refetch(); pendingList.refetch(); }
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  const list = tabList.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Loan Decisions" subtitle="Organizer" />
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        {/* Fund balance */}
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" style={{ opacity: 0.7, color: semantic.textSecondary }}>Available fund balance</Text>
            {liquidity.loading ? <ActivityIndicator /> : <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold' }}>{formatPeso(available)}</Text>}
          </View>
          <Wallet size={26} color={semantic.brandDark} />
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
                    <Pressable onPress={() => openApprove(l)} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#EAF2F6', borderRadius: 12, paddingVertical: 11 }}>
                      <Check size={16} color="#5E8497" strokeWidth={2.4} />
                      <Text variant="label" style={{ color: '#5E8497', fontSize: 13.5 }}>Approve</Text>
                    </Pressable>
                    <Pressable onPress={() => setRejectTarget(l)} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#F7E5E5', borderRadius: 12, paddingVertical: 11 }}>
                      <X size={16} color="#C25C5E" strokeWidth={2.4} />
                      <Text variant="label" style={{ color: '#C25C5E', fontSize: 13.5 }}>Reject</Text>
                    </Pressable>
                  </View>
                ) : l.status === 'approved' ? (
                  <View style={{ gap: 10 }}>
                    <Text variant="caption" color="secondary">
                      Approved{l.approved_principal && Number(l.approved_principal) !== Number(l.principal) ? ` for ${formatPeso(l.approved_principal)} (partial)` : ''} — awaiting disbursement
                    </Text>
                    <Pressable
                      onPress={() => confirmDisburse(l)}
                      disabled={disburse.loading}
                      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#E2F0E8', borderRadius: 12, paddingVertical: 11, opacity: disburse.loading ? 0.6 : 1 }}
                    >
                      {disburse.loading ? <ActivityIndicator size="small" color="#3E8E66" /> : <Banknote size={16} color="#3E8E66" strokeWidth={2.4} />}
                      <Text variant="label" style={{ color: '#3E8E66', fontSize: 13.5 }}>Disburse</Text>
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

      {/* Approve sheet — the lending decision only; disbursement is separate */}
      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable onPress={() => setTarget(null)} style={{ flex: 1, backgroundColor: 'rgba(42,62,75,0.35)', justifyContent: 'flex-end' }}>
            <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
              <Text variant="h2" style={{ fontSize: 18 }}>Approve loan</Text>
              {target ? (
                <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="label">{loanName(target)}</Text>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(target.principal)} requested</Text>
                  </View>
                  <Text variant="caption" color="secondary">{target.purpose} · {target.term_months} months</Text>
                  <Text variant="caption" color="secondary">Available fund cash: {formatPeso(available)}</Text>
                </View>
              ) : null}
              <View style={{ gap: 7 }}>
                <Text variant="overline" color="secondary">Approved amount (₱)</Text>
                <TextInput value={approvedAmount} onChangeText={setApprovedAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor={semantic.textMuted} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontFamily: 'Poppins_400Regular', fontSize: 15, color: semantic.textPrimary }} />
                <Text variant="caption" color="muted">Can be less than the requested amount if fund cash is short.</Text>
              </View>
              <View style={{ gap: 7 }}>
                <Text variant="overline" color="secondary">Monthly interest rate (%)</Text>
                <TextInput value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="3" placeholderTextColor={semantic.textMuted} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontFamily: 'Poppins_400Regular', fontSize: 15, color: semantic.textPrimary }} />
                <Text variant="caption" color="muted">e.g. 3 = 3% per month. Disbursement is a separate step after this.</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => setTarget(null)} style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: semantic.border }}>
                  <Text variant="label" color="secondary">Cancel</Text>
                </Pressable>
                <Pressable onPress={confirmApprove} disabled={approve.loading} style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: semantic.brand }}>
                  {approve.loading ? <ActivityIndicator color="#fff" /> : <Text variant="label" style={{ color: '#fff' }}>Approve</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <ReasonPrompt
        visible={!!rejectTarget}
        title={rejectTarget ? `Reject ${loanName(rejectTarget)}'s loan?` : 'Reject loan'}
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejectTarget(null)}
        onConfirm={onRejectConfirm}
      />
    </SafeAreaView>
  );
}
