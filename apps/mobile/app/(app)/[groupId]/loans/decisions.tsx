import { useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Wallet, Banknote, Eye, CheckCircle2, AlertTriangle, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { TabBar } from '@/components/ui/TabBar';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { SlideSheet } from '@/components/shared/SlideSheet';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useLoans, useLiquidity, useApproveLoan, useDisburseLoan, useRejectLoan, useLoanEligibility } from '@/features/lending/lending.hooks';
import type { Loan, LoanStatus } from '@/api/lending';

function loanName(l: Loan): string {
  return l.membership?.members?.full_name ?? 'Member';
}
function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LoanDecisions() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [tab, setTab] = useState<LoanStatus>('pending');

  const { membership } = useActiveGroup();
  const liquidity = useLiquidity(groupId!);
  const { cycle } = useActiveCycle(groupId!);
  const canDisburse = membership?.role === 'treasurer';
  const pendingList = useLoans(groupId!, { status: 'pending' });
  const tabList = useLoans(groupId!, { status: tab });
  const approve = useApproveLoan(groupId!);
  const disburse = useDisburseLoan(groupId!);
  const reject = useRejectLoan(groupId!);

  const [detailsTarget, setDetailsTarget] = useState<Loan | null>(null); // loan being viewed before a decision
  const eligibility = useLoanEligibility(groupId!, detailsTarget?.id);

  const [rejectTarget, setRejectTarget] = useState<Loan | null>(null);
  const available = Number(liquidity.data?.available_cash ?? 0);
  const hasCycleRate = cycle?.default_interest_rate != null;

  // Approving needs a rate — sourced from this cycle's configured default
  // (cycles/configure.tsx) instead of a second sheet asking the Owner to
  // type one in. Confirms with a dialog right here rather than opening
  // another screen just to review the same numbers again.
  function onApprovePress(l: Loan) {
    if (!hasCycleRate) {
      Alert.alert('No interest rate set', "This cycle has no default interest rate configured yet — set one in Configure Cycle before approving loans.");
      return;
    }
    const rate = Number(cycle!.default_interest_rate);
    const amount = available > 0 && available < Number(l.principal) ? available : Number(l.principal);
    const partial = amount < Number(l.principal);
    setDetailsTarget(null);
    Alert.alert(
      'Approve this loan?',
      `${formatPeso(amount)}${partial ? ` of the ${formatPeso(l.principal)} requested (fund cash is short)` : ''} at ${(rate * 100).toFixed(2)}% monthly, ${l.term_months} month${l.term_months === 1 ? '' : 's'}, for ${loanName(l)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => confirmApprove(l.id, rate, amount) },
      ],
    );
  }

  async function confirmApprove(loanId: string, rate: number, amount: number) {
    const ok = await approve.run(loanId, rate, String(amount));
    if (ok !== undefined) { pendingList.refetch(); tabList.refetch(); liquidity.refetch(); }
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
      <AppBar title="Loan Decisions" />
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text variant="label" style={{ fontSize: 14.5 }}>{loanName(l)}</Text>
                      {l.membership?.role === 'owner' ? (
                        <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
                          <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Organizer's request</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="caption" color="secondary">{l.purpose ?? '—'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(l.principal)}</Text>
                    <Text variant="caption" color="secondary">{l.term_months} mo</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StatusBadge entity="loan" value={l.status} />
                  <Pressable
                    onPress={() => setDetailsTarget(l)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: semantic.border }}
                  >
                    <Eye size={13} color={semantic.textSecondary} />
                    <Text variant="caption" style={{ color: semantic.textSecondary, fontFamily: 'Poppins_700Bold' }}>View details</Text>
                  </Pressable>
                </View>
                {l.status === 'approved' ? (
                  <View style={{ gap: 10, marginTop: 12 }}>
                    <Text variant="caption" color="secondary">
                      Approved{l.approved_principal && Number(l.approved_principal) !== Number(l.principal) ? ` for ${formatPeso(l.approved_principal)} (partial)` : ''} — awaiting disbursement
                    </Text>
                    {canDisburse ? (
                      <Pressable
                        onPress={() => confirmDisburse(l)}
                        disabled={disburse.loading}
                        style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#E2F0E8', borderRadius: 12, paddingVertical: 11, opacity: disburse.loading ? 0.6 : 1 }}
                      >
                        {disburse.loading ? <ActivityIndicator size="small" color="#3E8E66" /> : <Banknote size={16} color="#3E8E66" strokeWidth={2.4} />}
                        <Text variant="label" style={{ color: '#3E8E66', fontSize: 13.5 }}>Disburse</Text>
                      </Pressable>
                    ) : (
                      // The Owner decides (approves); the Treasurer releases the
                      // cash — keeping disbursement off the Owner's own screen.
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 11, justifyContent: 'center' }}>
                        <Banknote size={16} color={semantic.textMuted} strokeWidth={2.4} />
                        <Text variant="label" style={{ color: semantic.textMuted, fontSize: 13.5 }}>Waiting on the Treasurer</Text>
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* View details — what the Owner should review before deciding (TC-014/TC-034) */}
      <SlideSheet value={detailsTarget} onClose={() => setDetailsTarget(null)}>
        {(d) => (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Avatar name={loanName(d)} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h2" style={{ fontSize: 17 }}>{loanName(d)}</Text>
                <StatusBadge entity="loan" value={d.status} />
              </View>
              <Pressable onPress={() => setDetailsTarget(null)} hitSlop={10} style={{ padding: 2 }}>
                <X size={20} color={semantic.textMuted} />
              </Pressable>
            </View>

            <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" color="secondary">Purpose</Text>
                <Text variant="label" style={{ fontSize: 13 }}>{d.purpose ?? '—'}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" color="secondary">Requested principal</Text>
                <Text variant="label" style={{ fontSize: 13 }}>{formatPeso(d.principal)}</Text>
              </View>
              {d.approved_principal ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" color="secondary">Approved amount</Text>
                  <Text variant="label" style={{ fontSize: 13 }}>{formatPeso(d.approved_principal)}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" color="secondary">Term</Text>
                <Text variant="label" style={{ fontSize: 13 }}>{d.term_months} months</Text>
              </View>
              {d.interest_rate ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" color="secondary">Interest rate</Text>
                  <Text variant="label" style={{ fontSize: 13 }}>{(Number(d.interest_rate) * 100).toFixed(1)}% / month</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" color="secondary">Applied</Text>
                <Text variant="label" style={{ fontSize: 13 }}>{shortDate(d.applied_at)}</Text>
              </View>
              {d.rejection_reason ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" color="secondary">Rejection reason</Text>
                  <Text variant="label" style={{ fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{d.rejection_reason}</Text>
                </View>
              ) : null}
            </View>

            {d.status === 'pending' ? (
              <View style={{ backgroundColor: eligibility.data?.eligible === false ? '#F8EFDA' : '#E2F0E8', borderRadius: 14, padding: 13, gap: 8 }}>
                {eligibility.loading ? (
                  <ActivityIndicator color={semantic.brand} />
                ) : eligibility.data?.eligible ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={18} color="#3E8E66" />
                    <Text variant="label" style={{ color: '#3E8E66', fontSize: 13 }}>Eligible for approval</Text>
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={18} color="#A87C2C" />
                      <Text variant="label" style={{ color: '#A87C2C', fontSize: 13 }}>Review before approving</Text>
                    </View>
                    {(eligibility.data?.reasons ?? []).map((r) => (
                      <Text key={r} variant="caption" style={{ color: '#A87C2C' }}>· {r}</Text>
                    ))}
                  </View>
                )}
                <Text variant="caption" color="secondary">Available fund cash: {formatPeso(available)}</Text>
              </View>
            ) : null}

            {d.status === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={() => { setDetailsTarget(null); setRejectTarget(d); }}
                    style={{ alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#F7E5E5' }}
                  >
                    <Text variant="label" style={{ color: '#C25C5E' }}>Reject</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={() => onApprovePress(d)}
                    style={{ alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: semantic.brand }}
                  >
                    <Text variant="label" style={{ color: '#fff' }}>Approve</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}
      </SlideSheet>

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
