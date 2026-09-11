import { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Hash, Camera, Check, Clock3, AlertTriangle, RotateCcw,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { parseApiDate } from '@/lib/cycle';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions, useSubmitContribution } from '@/features/contributions/contributions.hooks';
import { PayGcashSheet } from '@/features/contributions/PayGcashSheet';
import { useProofScan, confirmSubmitDespiteDuplicate } from '@/features/contributions/useProofScan';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { pickCurrent } from '@/features/dashboard/MemberDashboard';
import type { PaymentMethod, Contribution } from '@/api/contributions';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'gcash', label: 'GCash' },
  { key: 'cash', label: 'Cash' },
  { key: 'bank_transfer', label: 'Bank' },
  { key: 'other', label: 'Other' },
];

type PageState = 'submit' | 'overdue' | 'review' | 'rejected';
/** Only meaningful while PageState is 'submit'/'overdue' — how the member is paying this period. The QR flow lives in a pull-up sheet on top of 'choose', not a route of its own. */
type PayRoute = 'choose' | 'manual';

function shortDate(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : parseApiDate(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
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

function Split({ items }: { items: { k: string; v: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: semantic.border }}>
      {items.map((it, i) => (
        <View key={it.k} style={{ flex: 1, paddingLeft: i > 0 ? 14 : 0, borderLeftWidth: i > 0 ? 1 : 0, borderColor: semantic.border }}>
          <Text variant="overline" color="muted">{it.k}</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }}>{it.v}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function ProofThumb({ path, title, sub }: { path: string | null; title: string; sub: string }) {
  const url = useSignedProofUrl(path);
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }, CARD_SHADOW]}>
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
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: t.soft, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 7 }}>
      <AlertTriangle size={14} color={t.text} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: t.text, lineHeight: 15.5 }}>{label}</Text>
    </View>
  );
}

function PaymentForm({
  amount, setAmount, method, setMethod, reference, setReference, proofUri, pickProof, amountHint, scanning,
}: {
  amount: string; setAmount: (v: string) => void;
  method: PaymentMethod; setMethod: (v: PaymentMethod) => void;
  reference: string; setReference: (v: string) => void;
  proofUri: string | null; pickProof: () => void;
  amountHint: string;
  scanning?: boolean;
}) {
  return (
    <>
      <SectionHead title="Record your payment" />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
        <Field label="Amount sent" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Text variant="caption" color="muted" style={{ marginTop: -10, marginBottom: 4 }}>{amountHint}</Text>

        <Text variant="overline" color="secondary" style={{ marginTop: 6, marginBottom: 8 }}>Payment method</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          {METHODS.map((m) => {
            const active = method === m.key;
            return (
              <Pressable key={m.key} onPress={() => setMethod(m.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: active ? semantic.textPrimary : semantic.surfaceAlt }}>
                <Text variant="label" style={{ fontSize: 12.5, color: active ? '#fff' : semantic.textSecondary }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 15 }}>
          <Field label="Reference number" placeholder="e.g. 9921 4456 7780" value={reference} onChangeText={setReference} leading={<Hash size={18} color={semantic.textMuted} />} />
        </View>
      </View>

      <SectionHead title="Proof of payment" aside="Optional" />
      <Pressable
        onPress={pickProof}
        disabled={scanning}
        style={{ borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 16, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}
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
    </>
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

  const rows = (contribs.data ?? []).filter((c: Contribution) => c.membership_id === membership?.id);
  const current = rowId ? (rows.find((r) => r.id === rowId) ?? null) : pickCurrent(rows);
  const loading = cycleLoading || contribs.loading;

  const heads = membership?.heads ?? 1;
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

  // "Pay online" (the QR sheet) only exists once the group's Owner has set a
  // treasurer GCash number (see group/settings.tsx) — otherwise there's
  // nothing to build a QR against, so the flow goes straight to the manual
  // record-it-yourself form, same as before this feature existed.
  const hasTreasurerGcash = !!group?.treasurer_gcash_number;
  const [route, setRoute] = useState<PayRoute>(() => (hasTreasurerGcash ? 'choose' : 'manual'));
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { scanning, flags, scanMeta, scanProof, reset: resetScan } = useProofScan({
    groupId,
    expectedAmount: payAmount,
    treasurerGcashNumber: group?.treasurer_gcash_number,
    onFields: (fields) => {
      if (fields.amount) setAmount(fields.amount);
      if (fields.reference) setReference(fields.reference);
      if (fields.method) setMethod(fields.method);
    },
  });

  useEffect(() => {
    if (loading) return;
    if (state === 'rejected' && current) {
      setAmount(String(current.amount));
      setMethod(current.payment_method ?? 'gcash');
      setReference(current.external_reference ?? '');
    } else if ((state === 'submit' || state === 'overdue') && cycle && !amount) {
      setAmount(String(current?.amount ?? expected));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, state, cycle?.id, current?.id]);

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
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter a valid contribution amount.');

    if (groupId) {
      const proceed = await confirmSubmitDespiteDuplicate(groupId, reference, !!flags);
      if (!proceed) return;
    }

    setUploading(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'contribution');
      const ok = await submit.run({ cycle_id: cycle.id, amount: amt, payment_method: method, external_reference: reference || undefined, proof_url });
      if (ok !== undefined) {
        Alert.alert('Submitted', 'Your contribution was submitted for confirmation.');
        router.back();
      } else if (submit.error) {
        Alert.alert('Could not submit', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const TITLES: Record<PageState, { t: string; s: string }> = {
    submit: { t: 'Submit payment', s: `${group?.name ?? 'Group'} · ${cycle?.name ?? ''}` },
    overdue: { t: 'Submit payment', s: `${group?.name ?? 'Group'} · ${cycle?.name ?? ''} · overdue` },
    review: { t: 'Payment status', s: `${group?.name ?? 'Group'} · ${cycle?.name ?? ''}` },
    rejected: { t: 'Resubmit proof', s: `${group?.name ?? 'Group'} · ${cycle?.name ?? ''}` },
  };
  const title = TITLES[state].t;
  const subtitle = TITLES[state].s;

  // `&& !cycle`, not just `loading` — useQuery's background refetch (e.g. the
  // AppState-triggered one that fires the instant the native image picker
  // hands control back, see useApi.ts) sets loading=true on every foreground
  // return while deliberately KEEPING the previous cycle/contribs data. Gating
  // on loading alone would unmount this whole screen — including an open
  // PayGcashSheet and whatever photo the member just attached — every single
  // time. Once cycle has loaded once, a later refetch should update this
  // screen in place, not tear it down and rebuild it.
  if (loading && !cycle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Payment" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!cycle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Submit payment" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>This group has no active contribution cycle right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title={title} subtitle={subtitle} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Summary hero (all states) ---------------- */}
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
          {state === 'submit' && (() => {
            const diff = due ? daysBetween(due, now) : null;
            return (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Amount due</Text>
                  <Badge tone="success" label="On time" Icon={Check} />
                </View>
                <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(current?.amount ?? expected)}</Text>
                <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                  {cycle.name}{due ? <> · due <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(due)}</Text>{diff !== null && diff >= 0 ? ` · ${diff} day${diff === 1 ? '' : 's'} left` : ''}</> : ' · no due date set'}
                </Text>
                <Split items={[{ k: 'Heads', v: String(heads) }, { k: 'Per head', v: formatPeso(cycle.contribution_amount) }]} />
              </>
            );
          })()}

          {state === 'overdue' && (() => {
            const lateDays = due ? Math.abs(daysBetween(due, now)) : 0;
            return (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Amount due</Text>
                  <Badge tone="danger" label={`${lateDays} day${lateDays === 1 ? '' : 's'} late`} Icon={AlertTriangle} />
                </View>
                <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(current?.amount ?? expected)}</Text>
                <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                  {cycle.name} · was due <Text style={{ fontWeight: '700', color: intent.danger.text }}>{shortDate(due)}</Text>
                </Text>
                <Split items={[{ k: 'Heads', v: String(heads) }, { k: 'Per head', v: formatPeso(cycle.contribution_amount) }]} />
              </>
            );
          })()}

          {state === 'review' && current && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Submitted</Text>
                <Badge tone="info" label="Under review" Icon={Clock3} />
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(current.amount)}</Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                Sent <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(current.created_at)}</Text>{current.external_reference ? ` · ref ${current.external_reference}` : ''}
              </Text>
              <Split items={[{ k: 'For', v: cycle.name }, { k: 'Heads', v: String(heads) }]} />
            </>
          )}

          {state === 'rejected' && current && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Still unpaid</Text>
                <Badge tone="danger" label="Needs resubmission" Icon={AlertTriangle} />
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(current.amount)}</Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                {cycle.name}{due ? <> · was due <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(current.due_date)}</Text></> : ''}
              </Text>
              <Split items={[{ k: 'Submitted', v: shortDate(current.created_at) }, { k: 'Returned', v: shortDate(current.updated_at) }]} />
            </>
          )}
        </View>

        {/* ---------------- Overdue: penalty notice ---------------- */}
        {state === 'overdue' && cycle.penalty_amount ? (
          <View style={{ marginTop: 15, backgroundColor: intent.warning.soft, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11 }}>
            <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(168,124,44,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>!</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>
                A {cycle.penalty_type === 'percent' ? `${cycle.penalty_amount}%` : formatPeso(cycle.penalty_amount)} late penalty may be added
              </Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>
                Penalties are reviewed by the Owner before they're applied, and can be waived. Paying now stops it from growing.
              </Text>
            </View>
          </View>
        ) : null}

        {/* ---------------- Submit / Overdue: choose how to pay ---------------- */}
        {(state === 'submit' || state === 'overdue') && route === 'choose' && (
          <>
            <SectionHead title="How would you like to pay" />
            <Button label={`Pay ${formatPeso(payAmount)} with GCash`} onPress={() => setPaySheetOpen(true)} />
            <Button label="I already paid — record it" variant="ghost" onPress={() => setRoute('manual')} style={{ marginTop: 10 }} />
            <Text variant="caption" color="muted" style={{ marginTop: 12, lineHeight: 16 }}>
              Scan a QR to send the money straight to the treasurer, then upload your receipt — it's read automatically, and a different officer still confirms it before it posts.
            </Text>
          </>
        )}

        {/* ---------------- Submit / Overdue: record payment ---------------- */}
        {(state === 'submit' || state === 'overdue') && route === 'manual' && (
          <>
            {!scanning && scanMeta ? (
              <View style={{ marginTop: 20 }}>
                {flags?.amountMismatch ? <FlagRow tone="warn" label={`The amount on the receipt doesn't match the ${formatPeso(payAmount)} due — double-check before submitting.`} /> : null}
                {flags?.recipientMismatch ? <FlagRow tone="danger" label="This doesn't look like it was sent to the treasurer's GCash number — make sure you sent it to the right account." /> : null}
                {flags?.duplicateRef ? <FlagRow tone="danger" label="This reference number is already attached to another contribution in this group." /> : null}
                {scanMeta.confidence === 'low' ? <FlagRow tone="warn" label={scanMeta.notes ? `Hard to read clearly: ${scanMeta.notes}` : 'The photo was hard to read clearly — double-check the fields below.'} /> : null}
              </View>
            ) : null}

            <PaymentForm
              amount={amount} setAmount={setAmount}
              method={method} setMethod={setMethod}
              reference={reference} setReference={setReference}
              proofUri={proofUri} pickProof={pickProof} scanning={scanning}
              amountHint="Paying more than expected? That's fine — extra counts as advance credit for future cycles."
            />
            <Text variant="caption" color="secondary" style={{ marginTop: 14, lineHeight: 17 }}>
              {state === 'overdue'
                ? "If you're having trouble paying this month, message an officer before the next due date. Late periods can often be worked out."
                : "Your payment isn't counted yet. An officer will confirm it before it's posted to the ledger."}
            </Text>
            <Button
              label={state === 'overdue' ? 'Submit payment now' : 'Submit for review'}
              onPress={onSubmit}
              loading={submit.loading || uploading}
              style={{ marginTop: 18 }}
            />
            {hasTreasurerGcash ? (
              <Button label="Choose a different way to pay" variant="ghost" onPress={() => setRoute('choose')} style={{ marginTop: 10 }} />
            ) : null}
          </>
        )}

        {/* ---------------- Under review: read-only tracker ---------------- */}
        {state === 'review' && current && (
          <>
            <SectionHead title="Progress" aside="Step 2 of 3" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, gap: 4 }, CARD_SHADOW]}>
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
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, CARD_SHADOW]}>
                <Text variant="body" color="muted">No proof attached to this submission.</Text>
              </View>
            )}

            <Text variant="caption" color="secondary" style={{ marginTop: 14, lineHeight: 17 }}>
              Most submissions are reviewed within a couple of days. You'll get a notification the moment it's posted — or if something needs fixing.
            </Text>

            <Button
              label="View all my contributions"
              variant="ghost"
              onPress={() => router.replace({ pathname: '/(app)/[groupId]/contributions' as any, params: { groupId } })}
              style={{ marginTop: 18 }}
            />
          </>
        )}

        {/* ---------------- Rejected: reason, fix list, previous proof, resubmit ---------------- */}
        {state === 'rejected' && current && (
          <>
            <SectionHead title="Why it was returned" />
            <View style={{ backgroundColor: intent.danger.soft, borderRadius: 18, padding: 16 }}>
              <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', letterSpacing: 0.4, color: intent.danger.text, marginBottom: 6, textTransform: 'uppercase' }}>
                Returned {shortDate(current.updated_at)}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: '#8E3227', fontWeight: '600' }}>
                {current.rejection_reason ?? 'No reason was given — ask an officer for details.'}
              </Text>
              <Text variant="caption" style={{ color: '#A85A4C', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: 'rgba(192,57,43,0.15)', lineHeight: 16 }}>
                Your money hasn't been lost. Nothing was posted, so this period is still recorded as unpaid until a new proof is accepted.
              </Text>
            </View>

            <SectionHead title="What to fix" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, gap: 4 }, CARD_SHADOW]}>
              {[
                'Capture the whole receipt, including the amount at the bottom',
                'Check the reference number matches your receipt exactly',
                "Make sure the text isn't blurred or cropped",
              ].map((tip, i) => (
                <View key={tip} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: intent.warning.soft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>{i + 1}</Text>
                  </View>
                  <Text variant="body" color="secondary" style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>{tip}</Text>
                </View>
              ))}
            </View>

            {current.proof_url ? (
              <>
                <SectionHead title="What you sent before" />
                <ProofThumb path={current.proof_url} title="Previous proof" sub={`Returned ${shortDate(current.updated_at)}`} />
              </>
            ) : null}

            <PaymentForm
              amount={amount} setAmount={setAmount}
              method={method} setMethod={setMethod}
              reference={reference} setReference={setReference}
              proofUri={proofUri} pickProof={pickProof} scanning={scanning}
              amountHint="Change this only if you actually sent a different amount."
            />
            <Text variant="caption" color="secondary" style={{ marginTop: 14, lineHeight: 17 }}>
              Submitting again creates a new record for this period — it won't count as a second payment.
            </Text>
            <Button
              label="Resubmit for review"
              leading={<RotateCcw size={16} color="#fff" />}
              onPress={onSubmit}
              loading={submit.loading || uploading}
              style={{ marginTop: 18 }}
            />
          </>
        )}

      </ScrollView>

      <PayGcashSheet
        visible={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        cycleId={cycle.id}
        amount={payAmount}
        dueDate={due}
        onSubmitted={() => router.back()}
      />
    </SafeAreaView>
  );
}
