import { useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { SlideSheet } from '@/components/shared/SlideSheet';
import { semantic } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useLiquidity, useApproveLoan, useRejectLoan, useLoanEligibility } from '@/features/lending/lending.hooks';
import { headLabel, type Loan } from '@/api/lending';

export function loanName(l: Loan): string {
  const name = l.membership?.members?.full_name ?? 'Member';
  // One loan per head — say which head when it isn't the member's own.
  return l.head_no > 1 ? `${name} · ${headLabel(l.head_no, l.head_name)}` : name;
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="caption" color="secondary">{label}</Text>
      <Text variant="label" style={{ fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/**
 * Pull-up loan details — what the Organizer should review before deciding
 * (TC-014/TC-034) — with Reject / Approve for a pending request. Used by Loan
 * Decisions and the Organizer dashboard's loan request card.
 */
export function LoanDecisionSheet({ groupId, loan, onClose, onDecided }: {
  groupId: string;
  loan: Loan | null;
  onClose: () => void;
  /** After an approve or reject goes through — refresh the lists. */
  onDecided: () => void;
}) {
  const liquidity = useLiquidity(groupId);
  const { cycle } = useActiveCycle(groupId);
  const eligibility = useLoanEligibility(groupId, loan?.id);
  const approve = useApproveLoan(groupId);
  const reject = useRejectLoan(groupId);
  const [rejectTarget, setRejectTarget] = useState<Loan | null>(null);
  const available = Number(liquidity.data?.available_cash ?? 0);
  const hasCycleRate = cycle?.default_interest_rate != null;

  // Approving needs a rate — sourced from this cycle's configured default
  // (cycles/configure.tsx) and confirmed with a dialog, not another screen.
  function onApprovePress(l: Loan) {
    if (!hasCycleRate) {
      Alert.alert('No interest rate set', "This cycle has no default interest rate configured yet — set one in Configure Cycle before approving loans.");
      return;
    }
    const rate = Number(cycle!.default_interest_rate);
    const amount = available > 0 && available < Number(l.principal) ? available : Number(l.principal);
    const partial = amount < Number(l.principal);
    onClose();
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
    if (ok !== undefined) { liquidity.refetch(); onDecided(); }
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }

  async function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const ok = await reject.run(rejectTarget.id, reason || undefined);
    setRejectTarget(null);
    if (ok !== undefined) onDecided();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  return (
    <>
      <SlideSheet value={loan} onClose={onClose}>
        {(d) => (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Avatar name={loanName(d)} uri={d.membership?.members?.avatar_url} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h2" style={{ fontSize: 17 }}>{loanName(d)}</Text>
                <StatusBadge entity="loan" value={d.status} />
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={{ padding: 2 }}>
                <X size={20} color={semantic.textMuted} />
              </Pressable>
            </View>

            <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13, gap: 8 }}>
              <Row label="Purpose" value={d.purpose ?? '—'} />
              <Row label="Requested principal" value={formatPeso(d.principal)} />
              {d.approved_principal ? <Row label="Approved amount" value={formatPeso(d.approved_principal)} /> : null}
              <Row label="Term" value={`${d.term_months} months`} />
              {d.interest_rate ? <Row label="Interest rate" value={`${(Number(d.interest_rate) * 100).toFixed(1)}% / month`} /> : null}
              <Row label="Applied" value={shortDate(d.applied_at)} />
              {d.rejection_reason ? <Row label="Rejection reason" value={d.rejection_reason} /> : null}
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
                    onPress={() => { onClose(); setRejectTarget(d); }}
                    style={{ alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#F7E5E5' }}
                  >
                    <Text variant="label" style={{ color: '#C25C5E' }}>Reject</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={() => onApprovePress(d)}
                    disabled={approve.loading}
                    style={{ alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: semantic.brand, opacity: approve.loading ? 0.6 : 1 }}
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
    </>
  );
}
