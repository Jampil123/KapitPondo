import { useMemo, useState } from 'react';
import { View, ScrollView, Modal, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { X, Repeat, Check, XCircle, Image as ImageIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@/hooks/useApi';
import { listMembers } from '@/api/groups';
import { useLoans, useRecordRepayment, useRepayments, useConfirmRepayment, useRejectRepayment } from '@/features/lending/lending.hooks';
import type { Loan, LoanPayment } from '@/api/lending';

type Tab = 'pending' | 'record';

function loanName(l: Loan): string {
  return l.membership?.members?.full_name ?? 'Member';
}
function repaymentName(p: LoanPayment): string {
  return p.loans?.membership?.members?.full_name ?? 'Member';
}
function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function RecordRepayment() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { member } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');

  // ---- Pending confirmations ----
  const pending = useRepayments(groupId!, 'submitted');
  const confirmAction = useConfirmRepayment(groupId!);
  const rejectAction = useRejectRepayment(groupId!);
  const [rejectTarget, setRejectTarget] = useState<LoanPayment | null>(null);

  async function onConfirm(p: LoanPayment) {
    const ok = await confirmAction.run(p.id);
    if (ok !== undefined) pending.refetch();
    else if (confirmAction.error) Alert.alert('Could not confirm', confirmAction.error.message);
  }
  async function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const ok = await rejectAction.run(rejectTarget.id, reason || undefined);
    setRejectTarget(null);
    if (ok !== undefined) pending.refetch();
    else if (rejectAction.error) Alert.alert('Could not reject', rejectAction.error.message);
  }

  // ---- Record on behalf (direct) ----
  const loans = useLoans(groupId!, { status: 'active' });
  const repay = useRecordRepayment(groupId!);
  const [target, setTarget] = useState<Loan | null>(null);
  const [amount, setAmount] = useState('');
  const [verifierId, setVerifierId] = useState<string | null>(null);
  const [verifierName, setVerifierName] = useState('Select verifying officer');

  const list = loans.data ?? [];
  const pendingRows = pending.data ?? [];

  const officers = useQuery(() => listMembers(groupId!) as Promise<any[]>, [groupId]);
  const officerRows = useMemo(() => (Array.isArray(officers.data) ? officers.data : [])
    .filter((m: any) => m.role !== 'member' && m.member_id !== member?.id)
    .map((m: any) => ({ id: m.member_id, name: m.members?.full_name ?? m.full_name ?? 'Officer' })),
    [officers.data, member?.id]);

  function pickVerifier() {
    if (officerRows.length === 0) {
      return Alert.alert('No other officers', 'Segregation of duties requires a different officer to verify — add another owner/treasurer/auditor to this group first.');
    }
    Alert.alert('Verified by', undefined, [
      ...officerRows.map((o) => ({ text: o.name, onPress: () => { setVerifierId(o.id); setVerifierName(o.name); } })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function confirmRecord() {
    if (!target) return;
    const amt = toAmountString(amount);
    if (!amt || Number(amt) <= 0) return Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
    if (!verifierId) return Alert.alert('Select a verifier', 'Choose a different officer to verify this repayment.');
    const ok = await repay.run(target.id, { amount: amt, approver_id: verifierId });
    if (ok !== undefined) {
      setTarget(null); setAmount(''); setVerifierId(null); setVerifierName('Select verifying officer');
      loans.refetch(); Alert.alert('Recorded', 'Repayment recorded.');
    } else if (repay.error) Alert.alert('Could not record', repay.error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Repayments" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <Segmented<Tab>
          options={[{ key: 'pending', label: 'Pending', count: pendingRows.length }, { key: 'record', label: 'Record new' }]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'pending' ? (
          pending.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
          pendingRows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text variant="h3" style={{ fontSize: 16 }}>All confirmed</Text>
              <Text variant="body" color="secondary">No repayment claims waiting.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {pendingRows.map((p) => (
                <View key={p.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <Avatar name={repaymentName(p)} size={44} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label" style={{ fontSize: 14.5 }}>{repaymentName(p)}</Text>
                      <Text variant="caption" color="secondary">
                        Submitted {shortDate(p.created_at)}{p.recorder?.full_name ? ` by ${p.recorder.full_name}` : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(p.amount)}</Text>
                  </View>
                  {p.proof_signed_url ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      <ImageIcon size={14} color={semantic.textMuted} />
                      <Text variant="caption" color="muted">Proof attached</Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <Pressable onPress={() => onConfirm(p)} disabled={confirmAction.loading} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#E2F0E8', borderRadius: 12, paddingVertical: 11 }}>
                      <Check size={16} color="#3E8E66" strokeWidth={2.4} /><Text variant="label" style={{ color: '#3E8E66', fontSize: 13.5 }}>Confirm</Text>
                    </Pressable>
                    <Pressable onPress={() => setRejectTarget(p)} disabled={rejectAction.loading} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#F7E5E5', borderRadius: 12, paddingVertical: 11 }}>
                      <XCircle size={16} color="#C25C5E" strokeWidth={2.4} /><Text variant="label" style={{ color: '#C25C5E', fontSize: 13.5 }}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )
        ) : (
          loans.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
          list.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text variant="h3" style={{ fontSize: 16 }}>No active loans</Text>
              <Text variant="body" color="secondary">Nothing to record right now.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {list.map((l) => {
                const outstanding = Number(l.outstanding_balance ?? 0);
                const principal = Number(l.principal ?? 0);
                const pct = principal ? Math.max(0, Math.min(100, Math.round((1 - outstanding / principal) * 100))) : 0;
                return (
                  <View key={l.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                      <Avatar name={loanName(l)} size={42} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="label" style={{ fontSize: 14.5 }}>{loanName(l)}</Text>
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
            </View>
          )
        )}
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
                <Text variant="label">{loanName(target)}</Text>
                <Text variant="label">{formatPeso(target.outstanding_balance)} left</Text>
              </View>
            )}
            <View style={{ gap: 7 }}>
              <Text variant="overline" color="secondary">Amount</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="₱0" placeholderTextColor={semantic.textMuted} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: semantic.textPrimary }} />
            </View>
            <View style={{ gap: 7 }}>
              <Text variant="overline" color="secondary">Verified by (a different officer)</Text>
              <Pressable onPress={pickVerifier} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 }}>
                <Text variant="body" style={{ color: verifierId ? semantic.textPrimary : semantic.textMuted }}>{verifierName}</Text>
              </Pressable>
            </View>
            <Button label="Confirm repayment" onPress={confirmRecord} loading={repay.loading} />
          </View>
        </View>
      </Modal>

      <ReasonPrompt
        visible={!!rejectTarget}
        title={rejectTarget ? `Reject ${repaymentName(rejectTarget)}'s repayment?` : 'Reject repayment'}
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejectTarget(null)}
        onConfirm={onRejectConfirm}
      />
    </SafeAreaView>
  );
}
