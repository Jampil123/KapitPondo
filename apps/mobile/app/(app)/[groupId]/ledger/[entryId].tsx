import { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Image, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Flag, Undo2, Check, Clock3 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLedgerEntryDetail } from '@/features/ledger/ledger.hooks';
import { useFlagPosting } from '@/features/auditlog/auditlog.hooks';
import { FlagPrompt } from '@/features/flags/FlagPrompt';
import { AuditTimeline } from '@/features/auditlog/AuditTimeline';
import { ENTRY_TYPE_LABEL } from '@/features/audit/GroupLedgerView';
import { entryRef, initiateReversal, type ReversalRequest } from '@/api/ledger';
import { loanRef } from '@/api/loanAudits';

const CHANNEL: Record<string, string> = { gcash: 'GCash', cash: 'Cash', bank_transfer: 'Bank transfer', other: 'Other' };

function longDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Pill({ tone, label }: { tone: { soft: string; text: string }; label: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: tone.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.text }} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: tone.text }}>{label}</Text>
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: semantic.card, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 }, shadowToken.soft]}>
      <Text style={{ fontSize: 11.5, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 1 }}>{value}</Text>
    </View>
  );
}

function Step({ done, title, sub }: { done: boolean; title: string; sub?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 5 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? intent.success.soft : semantic.surfaceAlt, marginTop: 1 }}>
        {done ? <Check size={11} color={intent.success.text} strokeWidth={3} /> : <Clock3 size={11} color={semantic.textMuted} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: done ? semantic.textPrimary : semantic.textSecondary }}>{title}</Text>
        {sub ? <Text variant="caption" color="muted">{sub}</Text> : null}
      </View>
    </View>
  );
}

const REVERSAL_PILL: Record<ReversalRequest['status'], { label: string; tone: { soft: string; text: string } }> = {
  pending_verification: { label: 'Pending verification', tone: intent.warning },
  verified: { label: 'Verified · awaiting approval', tone: intent.info },
  finalized: { label: 'Approved', tone: intent.success },
  rejected: { label: 'Rejected', tone: intent.danger },
};

/** Where this entry's reversal stands: Treasurer starts, Auditor verifies, Organizer approves. */
function ReversalCard({ r }: { r: ReversalRequest }) {
  const pill = REVERSAL_PILL[r.status];
  const verified = !!r.verified_at;
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, marginTop: 14 }, shadowToken.soft]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Reversal</Text>
        <Pill tone={pill.tone} label={pill.label} />
      </View>
      <Text variant="caption" color="secondary" style={{ marginBottom: 6 }}>Reason: {r.reason}</Text>
      <Step done title={`Started by ${r.initiator?.full_name ?? 'the Treasurer'}`} sub={longDate(r.initiated_at)} />
      <Step
        done={verified}
        title={verified ? `Verified by ${r.verifier?.full_name ?? 'the Auditor'}` : 'The Auditor checks it'}
        sub={verified ? [longDate(r.verified_at), r.verify_notes].filter(Boolean).join(' · ') : null}
      />
      <Step
        done={r.status === 'finalized'}
        title={r.status === 'finalized' ? `Approved by ${r.finalizer?.full_name ?? 'the Organizer'}` : 'The Organizer approves it'}
        sub={r.status === 'finalized' ? `${longDate(r.finalized_at)} · correcting entry posted` : 'Balances change only once approved'}
      />
      {r.status === 'rejected' ? (
        <Text variant="caption" style={{ color: intent.danger.text, marginTop: 6, lineHeight: 16 }}>
          Rejected by {r.rejecter?.full_name ?? 'a reviewer'}{r.rejected_at ? ` on ${longDate(r.rejected_at)}` : ''}: {r.reject_reason ?? r.verify_notes ?? 'no reason given'}. The entry stands.
        </Text>
      ) : null}
    </View>
  );
}

export default function LedgerEntryPage() {
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const close = () => router.back();
  const { role } = useActiveGroup();
  const q = useLedgerEntryDetail(groupId!, entryId!);
  const flag = useFlagPosting(groupId!);
  const [flagging, setFlagging] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  const d = q.data;

  if (!d) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        {q.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40 }}>This entry couldn’t be found.</Text>
        )}
      </SafeAreaView>
    );
  }

  const { entry: e, record: r } = d;
  const credit = e.direction === 'credit';
  const kind = ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type.replace(/_/g, ' ');
  const who = e.membership?.members?.full_name ?? r?.name ?? null;
  const isLoan = e.entry_type === 'loan_disbursement';
  const rows = ([
    ['Date posted', longDate(e.posted_at)],
    ['Loan', r?.loan_no ? loanRef(r.loan_no) : null],
    ['Channel', r?.channel ? CHANNEL[r.channel] ?? r.channel : null],
    ['Reference no.', r?.reference ?? null],
    [isLoan ? 'Approved by' : 'Recorded by', r?.recorded_by ?? null],
    [isLoan ? 'Released by' : 'Verified by', r?.verified_by ?? e.poster?.full_name ?? null],
    ['Reversed by', d.reversed_by ? `${entryRef(d.reversed_by)}, ${longDate(d.reversed_by.posted_at)}` : null],
  ] as [string, string | null][]).filter(([, v]) => !!v) as [string, string][];
  const canFlag = role === 'auditor' && !!d.entity_type && !!d.source_id;
  const rr = d.reversal_request;
  const reversalOpen = rr && (rr.status === 'pending_verification' || rr.status === 'verified');
  const canReverse = role === 'treasurer' && d.can_reverse && !reversalOpen;
  const hasAction = canFlag || canReverse;

  async function onReverse(reason: string) {
    setReversing(false);
    try {
      await initiateReversal(groupId!, entryId!, reason);
      toast('Reversal sent to the Auditor');
      q.refetch();
    } catch (err) {
      Alert.alert('Could not start the reversal', (err as Error).message);
    }
  }

  async function onFlag(reason: string, note: string) {
    setFlagging(false);
    const ok = await flag.run({ entity_type: d!.entity_type!, entity_id: d!.source_id!, reason, note: note || undefined, label: `${entryRef(e)} · ${kind}${who ? ` · ${who}` : ''}` });
    if (ok === undefined) Alert.alert('Could not flag', flag.error?.message ?? 'Try again.');
    else {
      toast('Flagged — the Organizer has been notified');
      q.refetch();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <CloseHeader title={entryRef(e)} onClose={close} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: hasAction ? 110 : 40 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{who ? `${kind}, ${who}` : kind}</Text>
        <Text style={{ fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>
          {credit ? '+' : '−'}{formatPeso(e.amount)}
        </Text>
        <View style={{ marginTop: 6 }}>
          {d.reversed_by ? <Pill tone={intent.warning} label={`Reversed by ${entryRef(d.reversed_by)}`} /> : <Pill tone={intent.success} label="Verified" />}
        </View>

        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, marginTop: 16 }, shadowToken.soft]}>
          {rows.map(([label, value], i) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <Text style={{ fontSize: 13, color: semantic.textSecondary }}>{label}</Text>
              <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{value}</Text>
            </View>
          ))}
        </View>

        {r?.principal != null && r?.interest != null ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Tile label="Interest" value={formatPeso(r.interest)} />
            <Tile label="Principal" value={formatPeso(r.principal)} />
          </View>
        ) : null}

        {d.proof_url ? (
          <Pressable onPress={() => setViewingProof(true)} style={{ marginTop: 10 }}>
            <Image source={{ uri: d.proof_url }} style={{ width: '100%', height: 180, borderRadius: 16, backgroundColor: semantic.surfaceAlt }} resizeMode="cover" />
            <Text variant="caption" color="secondary" style={{ marginTop: 4, marginLeft: 2 }}>Proof of payment · tap to enlarge</Text>
          </Pressable>
        ) : null}

        {rr ? <ReversalCard r={rr} /> : null}

        <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 22, marginBottom: 9 }}>Entry history</Text>
        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16 }, shadowToken.soft]}>
          {d.history.length ? <AuditTimeline entries={d.history} /> : <Text variant="body" color="muted">No history yet.</Text>}
        </View>
      </ScrollView>

      {canReverse ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4 }}>
          <Pressable
            onPress={() => setReversing(true)}
            style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, backgroundColor: semantic.surface, borderWidth: 1, borderColor: intent.danger.soft }, shadowToken.soft]}
          >
            <Undo2 size={17} color={intent.danger.text} />
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>Reverse this entry</Text>
          </Pressable>
        </View>
      ) : null}

      <ReasonPrompt
        visible={reversing}
        title={`Reverse ${entryRef(e)}?`}
        placeholder="Why? e.g. Wrong amount. Proof shows ₱1,000."
        confirmLabel="Send to Auditor"
        destructive
        required
        onCancel={() => setReversing(false)}
        onConfirm={onReverse}
      />

      <Modal visible={viewingProof} transparent animationType="fade" onRequestClose={() => setViewingProof(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewingProof(false)}>
          {d.proof_url ? <Image source={{ uri: d.proof_url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>

      {canFlag ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4 }}>
          <Pressable
            onPress={() => setFlagging(true)}
            disabled={flag.loading}
            style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, backgroundColor: semantic.surface, borderWidth: 1, borderColor: semantic.border, opacity: flag.loading ? 0.6 : 1 }, shadowToken.soft]}
          >
            <Flag size={17} color={semantic.textPrimary} />
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Flag discrepancy</Text>
          </Pressable>
        </View>
      ) : null}

      <FlagPrompt visible={flagging} title={`Flag ${entryRef(e)}`} onCancel={() => setFlagging(false)} onConfirm={onFlag} />
    </SafeAreaView>
  );
}
