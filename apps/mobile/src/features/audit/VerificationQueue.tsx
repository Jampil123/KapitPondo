/**
 * features/audit/VerificationQueue.tsx
 * ----------------------------------------------------------------------------
 * Everything waiting on the Auditor's sign-off — contributions, repayments and
 * reversals — oldest first, with Verify / Reject right on the row. Records the
 * Auditor submitted themselves are shown but left to another officer (the API
 * enforces that too).
 */
import { useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, Image, Modal } from 'react-native';
import { Check, X, Receipt } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { Alert } from '@/lib/alert';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso, type Money } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useContributions, useApproveContribution, useRejectContribution } from '@/features/contributions/contributions.hooks';
import { useRepayments, useConfirmRepayment, useRejectRepayment } from '@/features/lending/lending.hooks';
import { useReversalRequests, useVerifyReversal, useRejectReversal } from '@/features/ledger/ledger.hooks';

type Kind = 'contribution' | 'repayment' | 'reversal';
type Item = {
  key: string;
  kind: Kind;
  id: string;
  name: string;
  label: string;
  amount: Money | null;
  date: string;
  /** undefined = this kind never carries proof. */
  proofUrl?: string | null;
  note?: string | null;
  mine: boolean;
};

const KIND_LABEL: Record<Kind, string> = { contribution: 'Contribution', repayment: 'Loan repayment', reversal: 'Reversal' };

function ago(iso: string) {
  const hrs = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function RowButton({ label, tone, Icon, onPress, disabled }: { label: string; tone: 'ok' | 'danger'; Icon: any; onPress: () => void; disabled?: boolean }) {
  const t = tone === 'ok' ? { bg: semantic.brandDark, fg: '#fff' } : { bg: intent.danger.soft, fg: intent.danger.text };
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.bg, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 11, opacity: disabled ? 0.5 : 1 }}>
      <Icon size={12} color={t.fg} strokeWidth={2.6} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.fg }}>{label}</Text>
    </Pressable>
  );
}

export function VerificationQueue({ groupId }: { groupId: string }) {
  const { membership } = useActiveGroup();
  const contribs = useContributions(groupId, {});
  const repayments = useRepayments(groupId);
  const reversals = useReversalRequests(groupId);

  const approveContrib = useApproveContribution(groupId);
  const rejectContrib = useRejectContribution(groupId);
  const confirmRepayment = useConfirmRepayment(groupId);
  const rejectRepayment = useRejectRepayment(groupId);
  const verifyReversal = useVerifyReversal(groupId);
  const rejectReversal = useRejectReversal(groupId);

  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Item | null>(null);
  const [proof, setProof] = useState<{ title: string; url: string } | null>(null);

  const items: Item[] = useMemo(() => {
    const me = membership?.id;
    return [
      ...(contribs.data ?? []).filter((c) => c.status === 'submitted').map((c): Item => {
        const name = c.memberships?.members?.full_name ?? 'Member';
        return { key: `c-${c.id}`, kind: 'contribution', id: c.id, name, label: `${name}'s contribution`, amount: c.amount, date: c.created_at, proofUrl: c.proof_signed_url, mine: c.membership_id === me };
      }),
      ...(repayments.data ?? []).filter((p) => p.status === 'submitted').map((p): Item => {
        const name = p.loans?.membership?.members?.full_name ?? 'Member';
        return { key: `p-${p.id}`, kind: 'repayment', id: p.id, name, label: `${name}'s repayment`, amount: p.amount, date: p.created_at, proofUrl: p.proof_signed_url, mine: p.loans?.membership_id === me };
      }),
      ...(reversals.data ?? []).filter((r) => r.status === 'pending_verification').map((r): Item => ({
        key: `r-${r.id}`, kind: 'reversal', id: r.id,
        name: r.entry?.description ?? r.entry?.entry_type.replace(/_/g, ' ') ?? 'Ledger entry',
        label: 'this reversal', amount: r.entry ? r.entry.amount : null, date: r.initiated_at, note: r.reason,
        mine: !!r.entry?.membership_id && r.entry.membership_id === me,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [contribs.data, repayments.data, reversals.data, membership?.id]);

  const loading = (contribs.loading || repayments.loading || reversals.loading) && items.length === 0;

  async function run(id: string, action: () => Promise<unknown>, refetch: () => void, failTitle: string, err: () => { message: string } | null) {
    setActingId(id);
    const ok = await action();
    setActingId(null);
    if (ok === undefined) Alert.alert(failTitle, err()?.message ?? 'Try again.');
    else refetch();
  }

  function onVerify(i: Item) {
    if (i.kind === 'contribution') run(i.id, () => approveContrib.run(i.id), contribs.refetch, 'Could not verify', () => approveContrib.error);
    else if (i.kind === 'repayment') run(i.id, () => confirmRepayment.run(i.id), repayments.refetch, 'Could not verify', () => confirmRepayment.error);
    else run(i.id, () => verifyReversal.run(i.id), reversals.refetch, 'Could not verify', () => verifyReversal.error);
  }

  function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const i = rejectTarget;
    setRejectTarget(null);
    const r = reason || undefined;
    if (i.kind === 'contribution') run(i.id, () => rejectContrib.run(i.id, r), contribs.refetch, 'Could not reject', () => rejectContrib.error);
    else if (i.kind === 'repayment') run(i.id, () => rejectRepayment.run(i.id, r), repayments.refetch, 'Could not reject', () => rejectRepayment.error);
    else run(i.id, () => rejectReversal.run(i.id, r), reversals.refetch, 'Could not reject', () => rejectReversal.error);
  }

  return (
    <>
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, marginTop: 14, overflow: 'hidden' }, shadowToken.soft]}>
        {loading ? (
          <ActivityIndicator color={semantic.brand} style={{ margin: 24 }} />
        ) : items.length === 0 ? (
          <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>Nothing is waiting for verification.</Text>
        ) : items.map((i, idx) => {
          const busy = actingId === i.id;
          const noProof = i.proofUrl === null;
          return (
            <View key={i.key} style={{ padding: 14, gap: 10, borderBottomWidth: idx < items.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {i.proofUrl ? (
                  <Pressable onPress={() => setProof({ title: `${KIND_LABEL[i.kind]} · ${i.name}`, url: i.proofUrl! })} style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', backgroundColor: semantic.surfaceAlt }}>
                    <Image source={{ uri: i.proofUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </Pressable>
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Receipt size={16} color={semantic.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{i.name}</Text>
                  <Text style={{ fontSize: 11.5, color: noProof ? intent.danger.text : semantic.textSecondary }} numberOfLines={1}>
                    {KIND_LABEL[i.kind]}, {noProof ? 'no proof attached' : ago(i.date)}
                  </Text>
                </View>
                {i.amount !== null ? <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(i.amount)}</Text> : null}
              </View>
              {i.note ? <Text style={{ fontSize: 12, lineHeight: 17, color: semantic.textSecondary, backgroundColor: semantic.surfaceAlt, borderRadius: 10, padding: 10 }}>{i.note}</Text> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                {i.mine ? (
                  <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>Yours — another officer verifies</Text>
                ) : (
                  <>
                    <RowButton label="Reject" tone="danger" Icon={X} onPress={() => setRejectTarget(i)} disabled={busy} />
                    <RowButton label={busy ? '…' : 'Verify'} tone="ok" Icon={Check} onPress={() => onVerify(i)} disabled={busy} />
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <ReasonPrompt
        visible={!!rejectTarget}
        title={`Reject ${rejectTarget?.label ?? 'this item'}?`}
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejectTarget(null)}
        onConfirm={onRejectConfirm}
      />
      <Modal visible={!!proof} transparent animationType="fade" onRequestClose={() => setProof(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setProof(null)}>
          <View style={{ width: '100%', backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{proof?.title}</Text>
              <Pressable onPress={() => setProof(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {proof?.url ? <Image source={{ uri: proof.url }} style={{ width: '100%', height: 360 }} resizeMode="contain" /> : null}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
