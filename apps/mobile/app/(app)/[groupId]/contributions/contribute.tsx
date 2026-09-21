import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import {
  Hash, Camera, Check, Clock3, AlertTriangle, RotateCcw, CalendarClock, Users, Smartphone, X, Copy, QrCode as QrCodeIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { parseApiDate } from '@/lib/cycle';
import { buildContributionReference } from '@/lib/qrPh';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions, useSubmitContribution } from '@/features/contributions/contributions.hooks';
import { buildTimeline } from '@/features/contributions/periods';
import { useQuery } from '@/hooks/useApi';
import { listOfficers } from '@/api/groups';
import { useProofScan, confirmSubmitDespiteDuplicate, type ProofFlags } from '@/features/contributions/useProofScan';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import type { Contribution } from '@/api/contributions';

type PageState = 'submit' | 'overdue' | 'review' | 'rejected';

function shortDate(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : parseApiDate(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function CloseHeader({ title, onClose }: { title?: string; onClose: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56 }}>
      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={20} color={semantic.textPrimary} />
      </Pressable>
      {title ? <Text variant="h3" style={{ fontSize: 16 }} numberOfLines={1}>{title}</Text> : null}
    </View>
  );
}

function Badge({ tone, label, Icon }: { tone: IntentName; label: string; Icon: any }) {
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
      <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: t.strong, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={9} color="#fff" strokeWidth={2.6} />
      </View>
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 24, marginBottom: 10 }}>{title}</Text>
  );
}

/** The amount, front and centre, with its status and due date; the copy icon is only passed while the member still has to pay. */
function AmountBlock({ label, amount, badge, meta, note, copied, onCopy }: {
  label: string; amount: number | string; badge: ReactNode; meta: ReactNode; note?: string; copied?: boolean; onCopy?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <Text variant="overline" color="muted">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.6 }}>{formatPeso(amount)}</Text>
        {onCopy ? (
          <Pressable onPress={onCopy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy amount">
            {copied ? <Check size={18} color={intent.success.text} /> : <Copy size={18} color={semantic.textMuted} />}
          </Pressable>
        ) : null}
      </View>
      <View style={{ marginTop: 10 }}>{badge}</View>
      <Text variant="body" color="secondary" style={{ marginTop: 10, fontSize: 12.5, textAlign: 'center' }}>{meta}</Text>
      {note ? <Text variant="caption" color="muted" style={{ marginTop: 3 }}>{note}</Text> : null}
    </View>
  );
}

function ProofThumb({ path, title, sub }: { path: string | null; title: string; sub: string }) {
  const url = useSignedProofUrl(path);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

/** A validation warning surfaced from the AI receipt read — flags, never blocks. */
function FlagRow({ label, tone }: { label: string; tone: 'warn' | 'danger' }) {
  const t = tone === 'danger' ? intent.danger : intent.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 8 }}>
      <AlertTriangle size={14} color={t.text} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: t.text, lineHeight: 15.5 }}>{label}</Text>
    </View>
  );
}

/** "Can't proceed yet" state — no-cycle / no-officer / no-gcash. */
function BlockedState({ icon: Icon, tone, title, body }: { icon: any; tone: IntentName; title: string; body: string }) {
  const t = intent[tone];
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Icon size={26} color={t.text} />
      </View>
      <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, textAlign: 'center' }}>{title}</Text>
      <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 320 }}>{body}</Text>
    </View>
  );
}

function DetailRow({ label, value, copied, onCopy, last }: { label: string; value: string; copied: boolean; onCopy: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onCopy}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="overline" color="muted" style={{ marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{value}</Text>
      </View>
      {copied ? <Check size={16} color={intent.success.text} /> : <Copy size={16} color={semantic.textMuted} />}
    </Pressable>
  );
}

/** The treasurer's GCash QR plus copyable recipient and reference — what the member needs to pay. */
function GcashDetails({ qrPath, recipientName, number, reference, copiedField, onCopy }: {
  qrPath: string | null | undefined; recipientName: string; number: string; reference: string;
  copiedField: string | null; onCopy: (key: string, value: string) => void;
}) {
  const qrUrl = useSignedProofUrl(qrPath);
  return (
    <>
      <SectionHead title="Pay with GCash" />
      {qrPath ? (
        <View style={{ alignItems: 'center' }}>
          {qrUrl ? (
            <Image source={{ uri: qrUrl }} style={{ width: 200, height: 200, borderRadius: 8 }} resizeMode="contain" />
          ) : (
            <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={semantic.brand} />
            </View>
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <QrCodeIcon size={20} color={semantic.textMuted} />
          <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 16 }}>No QR uploaded yet — use the details below.</Text>
        </View>
      )}
      <View style={{ marginTop: 6 }}>
        <DetailRow label={`Recipient · ${recipientName}`} value={number} copied={copiedField === 'number'} onCopy={() => onCopy('number', number)} />
        <DetailRow label="Reference · put in the message field" value={reference} copied={copiedField === 'ref'} onCopy={() => onCopy('ref', reference)} last />
      </View>
    </>
  );
}

function PaymentForm({
  amount, setAmount, reference, setReference, proofUri, pickProof, scanning, flags, scanMeta, dueAmountLabel,
}: {
  amount: string; setAmount: (v: string) => void;
  reference: string; setReference: (v: string) => void;
  proofUri: string | null; pickProof: () => void;
  scanning?: boolean;
  flags?: ProofFlags | null;
  scanMeta?: { confidence: string; notes: string | null } | null;
  dueAmountLabel: string;
}) {
  return (
    <>
      <SectionHead title="Attach your receipt" />
      <Pressable
        onPress={pickProof}
        disabled={scanning}
        style={{ borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 16, overflow: 'hidden' }}
      >
        {proofUri ? (
          <View>
            <Image source={{ uri: proofUri }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
            {scanning ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,20,22,0.55)', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <ActivityIndicator color="#fff" />
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Reading your receipt…</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
            <Camera size={24} color={semantic.brandDark} />
            <Text variant="bodySmall" color="secondary">Tap to attach a screenshot / photo</Text>
          </View>
        )}
      </Pressable>

      {!scanning && scanMeta ? (
        <View style={{ marginTop: 14 }}>
          {flags?.amountMismatch ? <FlagRow tone="warn" label={`The amount on the receipt doesn't match the ${dueAmountLabel} due — double-check before submitting.`} /> : null}
          {flags?.recipientMismatch ? <FlagRow tone="danger" label="This doesn't look like it was sent to the treasurer's GCash number — make sure you sent it to the right account." /> : null}
          {flags?.duplicateRef ? <FlagRow tone="danger" label="This reference number is already attached to another contribution in this group." /> : null}
          {scanMeta.confidence === 'low' ? <FlagRow tone="warn" label={scanMeta.notes ? `Hard to read clearly: ${scanMeta.notes}` : 'The photo was hard to read clearly — double-check the fields below.'} /> : null}
        </View>
      ) : null}

      <View style={{ gap: 14, marginTop: 16 }}>
        <Field label="Amount sent" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Field label="Reference number" placeholder="e.g. 9921 4456 7780" value={reference} onChangeText={setReference} leading={<Hash size={18} color={semantic.textMuted} />} />
      </View>
    </>
  );
}

/** What the member just sent, captured at submit time so the success page doesn't depend on the refetched data. */
type Receipt = {
  amount: string;
  reference: string;
  submittedAt: Date;
  cycleName: string;
  dueDate: Date | null;
  recipient: string | null;
  resubmitted: boolean;
};

function SummaryRow({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <Text variant="caption" color="muted">{label}</Text>
      {typeof value === 'string' ? (
        <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, textAlign: 'right' }}>{value}</Text>
      ) : value}
    </View>
  );
}

function SuccessView({ receipt, onClose, onViewAll }: { receipt: Receipt; onClose: () => void; onViewAll: () => void }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: <Badge tone="info" label="Under review" Icon={Clock3} /> },
    { label: 'For', value: receipt.dueDate ? `${receipt.cycleName} · due ${shortDate(receipt.dueDate)}` : receipt.cycleName },
    ...(receipt.recipient ? [{ label: 'Sent to', value: receipt.recipient }] : []),
    ...(receipt.reference ? [{ label: 'Reference', value: receipt.reference }] : []),
    { label: 'Submitted', value: `${shortDate(receipt.submittedAt)}, ${receipt.submittedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader onClose={onClose} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', paddingTop: 20 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: intent.success.base, alignItems: 'center', justifyContent: 'center' }}>
              <Check size={28} color="#fff" strokeWidth={3} />
            </View>
          </View>
          <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 18 }}>
            {receipt.resubmitted ? 'Payment resubmitted' : 'Payment submitted'}
          </Text>
          <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.6, marginTop: 6 }}>{formatPeso(receipt.amount)}</Text>
          <Text variant="body" color="secondary" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>
            An officer will confirm it. You&apos;ll be notified once it&apos;s posted.
          </Text>
        </View>

        <View style={{ marginTop: 28 }}>
          {rows.map((r, i) => <SummaryRow key={r.label} label={r.label} value={r.value} last={i === rows.length - 1} />)}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
        <Button label="Done" onPress={onClose} />
        <Button label="View my contributions" variant="ghost" onPress={onViewAll} />
      </View>
    </SafeAreaView>
  );
}

export default function Contribute() {
  // `id` opens one specific row from the history list (features/contributions/periods.ts
  // builds these); `due` is passed instead when the list computed a period as
  // overdue with no backing row yet — the server only creates a 'late' row lazily,
  // and only when an officer (not the member) views the list, so a member can be
  // genuinely overdue with nothing in the database to point `id` at.
  const { groupId, id: rowId, due: dueParam } = useLocalSearchParams<{ groupId: string; id?: string; due?: string }>();
  const router = useRouter();
  const { membership, group } = useActiveGroup();
  const { cycle, loading: cycleLoading } = useActiveCycle(groupId!);
  const contribs = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const submit = useSubmitContribution(groupId!);
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);
  const hasFundOfficer = !!officers.data?.officers.some((o) => o.role === 'treasurer' || o.role === 'auditor');
  const noOfficers = !officers.loading && !hasFundOfficer;

  const rows = (contribs.data ?? []).filter((c: Contribution) => c.membership_id === membership?.id);
  const heads = membership?.heads ?? 1;
  // Same "current period" rule as MemberDashboard's StandingCard — the first
  // not-yet-paid entry, or the last period if everything's paid. Deliberately
  // NOT "the most recent row regardless of status": a resubmission after a
  // rejection inserts a NEW row rather than editing the old one, so picking
  // by raw recency kept surfacing the superseded rejected row even after the
  // resubmission was approved (buildTimeline already collapses that).
  const timeline = cycle ? buildTimeline(cycle, rows, heads) : [];
  const current = rowId
    ? (rows.find((r) => r.id === rowId) ?? null)
    : (timeline.find((p) => p.kind !== 'paid') ?? timeline[timeline.length - 1] ?? null)?.row ?? null;
  const loading = cycleLoading || contribs.loading;
  const expected = cycle ? Number(cycle.contribution_amount) * heads : 0;
  const payAmount = Number(current?.amount ?? expected);
  const due = current?.due_date ? parseApiDate(current.due_date) : dueParam ? new Date(dueParam) : null;
  const now = new Date();

  const state: PageState =
    current?.status === 'submitted' ? 'review' :
    current?.status === 'rejected' ? 'rejected' :
    current?.is_late && due ? 'overdue' :
    !current && due && due < now ? 'overdue' :
    'submit';

  // Paying needs the group's Owner to have set a treasurer GCash number
  // (see group/settings.tsx) — without it the screen below is blocked outright.
  const hasTreasurerGcash = !!group?.treasurer_gcash_number;
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const { scanning, flags, scanMeta, scanProof, reset: resetScan } = useProofScan({
    groupId,
    expectedAmount: payAmount,
    treasurerGcashNumber: group?.treasurer_gcash_number,
    onFields: (fields) => {
      if (fields.amount) setAmount(fields.amount);
      if (fields.reference) setReference(fields.reference);
    },
  });

  // Keyed on the due date's timestamp, not the Date object — `due` is rebuilt every render, and the `new Date()` fallback is deliberately left out.
  const dueTime = due?.getTime();
  const qrReference = useMemo(
    () => (group && membership ? buildContributionReference({ fundCode: group.fund_code, membershipId: membership.id, when: dueTime ? new Date(dueTime) : new Date() }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group?.fund_code, membership?.id, dueTime],
  );

  useEffect(() => {
    if (loading) return;
    if (state === 'rejected' && current) {
      setAmount(String(current.amount));
      setReference(current.external_reference ?? '');
    } else if ((state === 'submit' || state === 'overdue') && cycle && !amount) {
      setAmount(String(current?.amount ?? expected));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, state, cycle?.id, current?.id]);

  async function copyValue(key: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 1500);
  }

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const uri = res.assets[0].uri;
    setProofUri(uri);
    resetScan();
    scanProof(uri);
  }

  async function onSubmit() {
    if (!cycle) return Alert.alert('No active cycle', 'There is no active cycle to contribute to yet.');
    if (noOfficers) return Alert.alert('No officer assigned', 'This group has no treasurer or auditor to confirm payments yet. Contact the group owner before submitting.');
    if (!hasTreasurerGcash) return Alert.alert('No GCash number set up', "The treasurer hasn't set up a verified GCash number yet. Check back once one has been approved before submitting.");
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter a valid contribution amount.');
    if (!proofUri) return Alert.alert('Proof required', 'Attach a photo or screenshot of your payment before submitting.');

    if (groupId) {
      const proceed = await confirmSubmitDespiteDuplicate(groupId, reference, !!flags);
      if (!proceed) return;
    }

    setUploading(true);
    try {
      const proof_url = await uploadImage('proofs', proofUri, 'contribution');
      const ok = await submit.run({
        cycle_id: cycle.id,
        amount: amt,
        payment_method: state === 'rejected' ? undefined : 'gcash',
        external_reference: reference || undefined,
        proof_url,
      });
      if (ok !== undefined) {
        setReceipt({
          amount: amt,
          reference: reference.trim(),
          submittedAt: new Date(),
          cycleName: cycle.name,
          dueDate: due,
          recipient: state === 'rejected' ? null : [group?.treasurer_gcash_name, group?.treasurer_gcash_number].filter(Boolean).join(' · ') || null,
          resubmitted: state === 'rejected',
        });
      } else if (submit.error) {
        Alert.alert('Could not submit', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const TITLES: Record<PageState, string> = {
    submit: 'Submit payment',
    overdue: 'Submit payment',
    review: 'Payment status',
    rejected: 'Resubmit proof',
  };
  const title = TITLES[state];
  const close = () => router.back();

  if (receipt) {
    return (
      <SuccessView
        receipt={receipt}
        onClose={close}
        onViewAll={() => router.replace({ pathname: '/(app)/[groupId]/contributions' as any, params: { groupId } })}
      />
    );
  }

  // `&& !cycle`, not just `loading` — useQuery's background refetch (e.g. the
  // AppState-triggered one that fires the instant the native image picker
  // hands control back, see useApi.ts) sets loading=true on every foreground
  // return while deliberately KEEPING the previous cycle/contribs data. Gating
  // on loading alone would unmount this whole screen — including whatever photo
  // the member just attached — every single time. Once cycle has loaded once,
  // a later refetch should update this screen in place, not tear it down.
  //
  // `awaitingFirstLoad` covers the other half: until contributions have loaded
  // once, `current` is null, so the page would render as "Submit payment" for a
  // moment and then flip to "Payment status" (or "Resubmit proof"). Data is kept
  // across refetches, so this only holds the very first paint.
  const awaitingFirstLoad = contribs.data === null && contribs.loading;
  if ((loading && !cycle) || awaitingFirstLoad) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="" onClose={close} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!cycle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Submit payment" onClose={close} />
        <BlockedState
          icon={CalendarClock}
          tone="info"
          title="No active cycle yet"
          body="This group doesn't have an active contribution cycle right now. Check back once the owner starts one."
        />
      </SafeAreaView>
    );
  }

  if (noOfficers && (state === 'submit' || state === 'overdue')) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Submit payment" onClose={close} />
        <BlockedState
          icon={Users}
          tone="warning"
          title="No officer assigned"
          body="This group has no treasurer or auditor yet, so there's no one to confirm your payment. Contact the group owner before submitting."
        />
      </SafeAreaView>
    );
  }

  // Blocks ALL payment methods here (not just GCash) — without a verified GCash
  // number there's no confirmed treasurer to reconcile against yet.
  if (!hasTreasurerGcash && (state === 'submit' || state === 'overdue')) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Submit payment" onClose={close} />
        <BlockedState
          icon={Smartphone}
          tone="warning"
          title="No GCash number set up"
          body="The treasurer hasn't set up a verified GCash number yet, so payments can't be recorded or confirmed. Check back once one has been approved."
        />
      </SafeAreaView>
    );
  }

  const canPay = state === 'submit' || state === 'overdue';
  const busy = submit.loading || uploading;
  const diff = due ? daysBetween(due, now) : null;
  const lateDays = due ? Math.abs(daysBetween(due, now)) : 0;
  const breakdown = `${heads} head${heads === 1 ? '' : 's'} × ${formatPeso(cycle.contribution_amount)}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title={title} onClose={close} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

          {state === 'submit' && (
            <AmountBlock
              label="Amount due"
              amount={current?.amount ?? expected}
              badge={<Badge tone="success" label="On time" Icon={Check} />}
              meta={<>{cycle.name}{due ? <> · due <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(due)}</Text>{diff !== null && diff >= 0 ? ` · ${diff} day${diff === 1 ? '' : 's'} left` : ''}</> : ' · no due date set'}</>}
              note={breakdown}
              copied={copiedField === 'amount'}
              onCopy={() => copyValue('amount', payAmount.toFixed(2))}
            />
          )}

          {state === 'overdue' && (
            <AmountBlock
              label="Amount due"
              amount={current?.amount ?? expected}
              badge={<Badge tone="danger" label={`${lateDays} day${lateDays === 1 ? '' : 's'} late`} Icon={AlertTriangle} />}
              meta={<>{cycle.name} · was due <Text style={{ fontWeight: '700', color: intent.danger.text }}>{shortDate(due)}</Text></>}
              note={breakdown}
              copied={copiedField === 'amount'}
              onCopy={() => copyValue('amount', payAmount.toFixed(2))}
            />
          )}

          {state === 'review' && current && (
            <AmountBlock
              label="Submitted"
              amount={current.amount}
              badge={<Badge tone="info" label="Under review" Icon={Clock3} />}
              meta={<>Sent <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(current.created_at)}</Text>{current.external_reference ? ` · ref ${current.external_reference}` : ''}</>}
              note={cycle.name}
            />
          )}

          {state === 'rejected' && current && (
            <AmountBlock
              label="Still unpaid"
              amount={current.amount}
              badge={<Badge tone="danger" label="Needs resubmission" Icon={AlertTriangle} />}
              meta={<>{cycle.name}{due ? <> · was due <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(current.due_date)}</Text></> : ''}</>}
              note={`Returned ${shortDate(current.updated_at)}`}
            />
          )}

          {state === 'overdue' && cycle.penalty_amount ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
              <AlertTriangle size={15} color={intent.warning.text} />
              <Text style={{ flex: 1, fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: intent.warning.text }}>
                A {cycle.penalty_type === 'percent' ? `${cycle.penalty_amount}%` : formatPeso(cycle.penalty_amount)} late penalty may be added
              </Text>
            </View>
          ) : null}

          {canPay && (
            <>
              <GcashDetails
                qrPath={group?.treasurer_gcash_qr_url}
                recipientName={group?.treasurer_gcash_name || 'Treasurer GCash'}
                number={group?.treasurer_gcash_number ?? ''}
                reference={qrReference}
                copiedField={copiedField}
                onCopy={copyValue}
              />
              <PaymentForm
                amount={amount} setAmount={setAmount}
                reference={reference} setReference={setReference}
                proofUri={proofUri} pickProof={pickProof} scanning={scanning}
                flags={flags} scanMeta={scanMeta} dueAmountLabel={formatPeso(payAmount)}
              />
            </>
          )}

          {state === 'review' && current && (
            <>
              <SectionHead title="Progress" />
              <View style={{ gap: 4 }}>
                {[
                  { done: true, now: false, title: 'You submitted your proof', sub: shortDate(current.created_at) },
                  { done: false, now: true, title: 'An officer is reviewing', sub: 'Checked against the amount and reference number' },
                  { done: false, now: false, title: 'Posted to the ledger', sub: 'Counts towards your capital and year-end share' },
                ].map((s, i, arr) => (
                  <View key={s.title} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ alignItems: 'center', width: 24 }}>
                      <View style={{
                        width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: s.done ? intent.success.base : s.now ? intent.info.base : semantic.surfaceAlt,
                      }}>
                        {s.done ? <Check size={11} color="#fff" strokeWidth={3} /> : (
                          <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: s.now ? '#fff' : semantic.textMuted }}>{i + 1}</Text>
                        )}
                      </View>
                      {i < arr.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: s.done ? intent.success.base : semantic.border, marginTop: 2 }} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 16 }}>
                      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: s.now ? intent.info.text : s.done ? semantic.textPrimary : semantic.textMuted }}>{s.title}</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 16 }}>{s.sub}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <SectionHead title="What you sent" />
              {current.proof_url ? (
                <ProofThumb path={current.proof_url} title="Proof of payment" sub={`Uploaded ${shortDate(current.created_at)}`} />
              ) : (
                <Text variant="body" color="muted">No proof attached to this submission.</Text>
              )}
            </>
          )}

          {state === 'rejected' && current && (
            <>
              <SectionHead title="Why it was returned" />
              <View style={{ borderLeftWidth: 3, borderColor: intent.danger.base, paddingLeft: 12 }}>
                <Text style={{ fontSize: 13, lineHeight: 19, color: '#8E3227', fontWeight: '600' }}>
                  {current.rejection_reason ?? 'No reason was given — ask an officer for details.'}
                </Text>
              </View>

              {current.proof_url ? (
                <>
                  <SectionHead title="What you sent before" />
                  <ProofThumb path={current.proof_url} title="Previous proof" sub={`Returned ${shortDate(current.updated_at)}`} />
                </>
              ) : null}

              <PaymentForm
                amount={amount} setAmount={setAmount}
                reference={reference} setReference={setReference}
                proofUri={proofUri} pickProof={pickProof} scanning={scanning}
                flags={flags} scanMeta={scanMeta} dueAmountLabel={formatPeso(payAmount)}
              />
            </>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: semantic.background }}>
          {state === 'review' ? (
            <Button
              label="View all my contributions"
              variant="ghost"
              onPress={() => router.replace({ pathname: '/(app)/[groupId]/contributions' as any, params: { groupId } })}
            />
          ) : (
            <Button
              label={state === 'rejected' ? 'Resubmit for review' : 'Submit payment'}
              leading={state === 'rejected' ? <RotateCcw size={16} color="#fff" /> : undefined}
              onPress={onSubmit}
              loading={busy}
              disabled={!proofUri}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
