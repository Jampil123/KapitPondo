import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Image, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Receipt, X, Flag, Send, Maximize2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { FlagPrompt } from '@/features/flags/FlagPrompt';
import { Alert } from '@/lib/alert';
import { CloseHeader, formatDateTime } from '@/features/payments/PaymentPage';
import { DetailSection, StatusPill } from '@/features/activity/DetailCard';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useRepayments } from '@/features/lending/lending.hooks';
import { useFlagPosting, useAskForProof } from '@/features/auditlog/auditlog.hooks';
import type { ProofEntityType } from '@/api/auditLog';

type Outcome = 'posted' | 'rejected' | 'pending';

const OUTCOME: Record<Outcome, { label: string; bg: string; fg: string }> = {
  posted: { label: 'Posted', bg: intent.success.soft, fg: intent.success.text },
  rejected: { label: 'Returned', bg: intent.danger.soft, fg: intent.danger.text },
  pending: { label: 'Under review', bg: intent.info.soft, fg: intent.info.text },
};

const METHOD: Record<string, string> = { gcash: 'GCash', cash: 'Cash', bank: 'Bank transfer' };

function when(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : formatDateTime(d);
}

function ActionButton({ label, tone, Icon, onPress, disabled }: { label: string; tone: 'ok' | 'danger'; Icon: any; onPress: () => void; disabled?: boolean }) {
  const t = tone === 'ok' ? { bg: semantic.brandDark, fg: '#fff' } : { bg: intent.danger.soft, fg: intent.danger.text };
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: t.bg, opacity: disabled ? 0.5 : 1 }}>
      <Icon size={14} color={t.fg} strokeWidth={2.4} />
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: t.fg }}>{label}</Text>
    </Pressable>
  );
}

/** One posting's proof and its record, opened from the Proofs list; the header is the close icon alone. */
export default function ProofDetail() {
  const { groupId, id, type } = useLocalSearchParams<{ groupId: string; id: string; type: ProofEntityType }>();
  const router = useRouter();
  const close = () => router.back();
  const isRepayment = type === 'loan_payment';

  const contribs = useContributions(groupId!, {});
  const repayments = useRepayments(groupId!);
  const flag = useFlagPosting(groupId!);
  const ask = useAskForProof(groupId!);
  const [flagging, setFlagging] = useState(false);
  const [zoom, setZoom] = useState(false);

  const item = useMemo(() => {
    if (isRepayment) {
      const p = (repayments.data ?? []).find((r) => r.id === id);
      if (!p) return null;
      const outcome: Outcome = p.status === 'paid' ? 'posted' : p.status === 'rejected' ? 'rejected' : 'pending';
      return {
        kind: 'Repayment', name: p.loans?.membership?.members?.full_name ?? 'Member', amount: p.amount, outcome,
        proofUrl: p.proof_signed_url, recordedById: p.recorded_by, recordedByName: p.recorder?.full_name ?? null,
        rows: [
          ['Member', p.loans?.membership?.members?.full_name ?? 'Member'],
          ['Principal', outcome === 'posted' ? formatPeso(p.principal_portion) : null],
          ['Interest', outcome === 'posted' ? formatPeso(p.interest_portion) : null],
          ['Paid via', p.payment_method ? METHOD[p.payment_method] ?? p.payment_method : null],
          ['Reference', p.external_reference],
        ] as [string, string | null][],
        record: [
          ['Submitted', when(p.created_at)],
          ['Recorded by', p.recorder?.full_name ?? (p.auto_confirmed ? 'Payment gateway' : null)],
          ['Verified by', p.verifier?.full_name ?? null],
          ['Posted', outcome === 'posted' ? when(p.paid_date) : null],
        ] as [string, string | null][],
        rejection: p.rejection_reason,
      };
    }
    const c = (contribs.data ?? []).find((r) => r.id === id);
    if (!c) return null;
    const outcome: Outcome = c.status === 'approved' ? 'posted' : c.status === 'rejected' ? 'rejected' : 'pending';
    return {
      kind: 'Contribution', name: c.memberships?.members?.full_name ?? 'Member', amount: c.amount, outcome,
      proofUrl: c.proof_signed_url, recordedById: c.recorded_by, recordedByName: c.recorder?.full_name ?? null,
      rows: [
        ['Member', c.memberships?.members?.full_name ?? 'Member'],
        ['Late penalty', Number(c.penalty_applied) > 0 && c.status !== 'late' ? formatPeso(c.penalty_applied) : null],
        ['Due', c.due_date ? new Date(c.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null],
        ['Paid via', c.payment_method ? METHOD[c.payment_method] ?? c.payment_method : null],
        ['Reference', c.external_reference],
      ] as [string, string | null][],
      record: [
        ['Submitted', when(c.created_at)],
        ['Recorded by', c.recorder?.full_name ?? (c.auto_confirmed ? 'Payment gateway' : null)],
        ['Verified by', c.approver?.full_name ?? null],
        ['Posted', outcome === 'posted' ? when(c.paid_date) : null],
      ] as [string, string | null][],
      rejection: c.rejection_reason,
    };
  }, [isRepayment, id, contribs.data, repayments.data]);

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        {contribs.loading || repayments.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40 }}>This posting couldn’t be found.</Text>
        )}
      </SafeAreaView>
    );
  }

  const o = OUTCOME[item.outcome];
  const missing = item.outcome === 'posted' && !item.proofUrl;
  const label = `${item.kind} · ${item.name} · ${formatPeso(item.amount)}`;

  async function onFlagConfirm(reason: string, note: string) {
    setFlagging(false);
    const ok = await flag.run({ entity_type: type!, entity_id: id!, reason, note: note || undefined, label });
    if (ok === undefined) Alert.alert('Could not flag', flag.error?.message ?? 'Try again.');
    else Alert.alert('Flagged', 'The Organizer has been notified.');
  }

  function onAsk() {
    if (!item?.recordedById) return;
    const recordedBy = item.recordedById;
    Alert.alert('Request proof', `Ask ${item.recordedByName ?? 'the recorder'} to attach a receipt?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Request', onPress: async () => {
          const ok = await ask.run({ entity_type: type!, entity_id: id!, recorded_by: recordedBy, label });
          if (ok === undefined) Alert.alert('Could not send', ask.error?.message ?? 'Try again.');
          else Alert.alert('Sent', `${item.recordedByName ?? 'They'} will be notified.`);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Summary */}
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text variant="overline" color="muted">{item.kind}</Text>
          <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8, marginTop: 4 }}>{formatPeso(item.amount)}</Text>
          <StatusPill label={missing ? 'Posted · no proof' : o.label} bg={missing ? intent.danger.soft : o.bg} fg={missing ? intent.danger.text : o.fg} />
        </View>

        {/* Proof */}
        <Pressable
          onPress={() => item.proofUrl && setZoom(true)}
          disabled={!item.proofUrl}
          style={{ marginTop: 18, height: 260, borderRadius: 16, overflow: 'hidden', backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
        >
          {item.proofUrl ? (
            <>
              <Image source={{ uri: item.proofUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={{ position: 'absolute', right: 10, bottom: 10, width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(9,32,42,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                <Maximize2 size={15} color="#fff" />
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Receipt size={30} color={semantic.textMuted} strokeWidth={1.5} />
              <Text variant="caption" color="secondary">No proof attached</Text>
            </View>
          )}
        </Pressable>

        {item.rejection ? (
          <View style={{ marginTop: 16, padding: 14, backgroundColor: intent.danger.soft, borderRadius: 14 }}>
            <Text variant="overline" style={{ color: intent.danger.text }}>Returned because</Text>
            <Text variant="body" style={{ color: intent.danger.text, marginTop: 3 }}>{item.rejection}</Text>
          </View>
        ) : null}

        <DetailSection title="Details" rows={item.rows} />
        <DetailSection title="Record" rows={item.record} />
      </ScrollView>

      {item.outcome === 'posted' ? (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderColor: semantic.border }}>
          {missing && item.recordedById ? <ActionButton label="Request proof" tone="ok" Icon={Send} onPress={onAsk} disabled={ask.loading} /> : null}
          <ActionButton label="Flag" tone="danger" Icon={Flag} onPress={() => setFlagging(true)} disabled={flag.loading} />
        </View>
      ) : null}

      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(9,12,14,0.95)', justifyContent: 'center' }} onPress={() => setZoom(false)}>
          {item.proofUrl ? <Image source={{ uri: item.proofUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          <Pressable onPress={() => setZoom(false)} hitSlop={10} style={{ position: 'absolute', top: 50, right: 20 }}>
            <X size={26} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      <FlagPrompt
        visible={flagging}
        title={`Flag ${item.name}'s ${item.kind.toLowerCase()}`}
        onCancel={() => setFlagging(false)}
        onConfirm={onFlagConfirm}
      />
    </SafeAreaView>
  );
}
