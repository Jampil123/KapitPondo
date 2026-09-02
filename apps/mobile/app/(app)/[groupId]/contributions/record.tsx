/**
 * app/(app)/[groupId]/contributions/record.tsx — Treasurer records a single
 * member's walk-in payment (cash/GCash/bank received outside the app).
 * Redesigned per the "treasurer-record-payment" reference, adapted to what's
 * actually real:
 *
 *   - a walk-in submission goes through the SAME submitted → a-different-
 *     officer-approves pipeline as a member's own self-submission (see
 *     contributions.routes.js/service.js) — it's tagged is_walk_in so the
 *     app shows it under "Awaiting Auditor" instead of mixing it with
 *     members' own proofs, but it does NOT post immediately. Segregation of
 *     duties applies here too: the recorder can't be the approver.
 *   - paid_date is set to today at APPROVAL time (current_date, hardcoded in
 *     approve_contribution) — so there's no "date received" field; backdating
 *     it would be a lie.
 *   - a short/over amount just posts as typed; there's no partial-payment or
 *     advance-credit concept anywhere in the ledger, so no fake choice
 *     buttons — just an honest mismatch note.
 *   - periods aren't tagged explicitly; a member's rows fill periods in
 *     chronological order (see periods.ts). "Recording against" shows
 *     whichever period that next fill will land on — informational, not a
 *     selectable dropdown, since picking one out of order wouldn't do
 *     anything different server-side.
 *   - proof upload reuses the same path contribute.tsx already uses for
 *     member self-submissions.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Banknote, Smartphone, Landmark, MoreHorizontal, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useQuery } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { listMembers } from '@/api/groups';
import type { PaymentMethod } from '@/api/contributions';
import { useContributions, useSubmitContribution } from '@/features/contributions/contributions.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { buildTimeline, periodLabel } from '@/features/contributions/periods';

const cardStyle = [{ backgroundColor: semantic.surface, borderRadius: 20 }, shadowToken.card] as const;

const METHODS: { key: PaymentMethod; icon: any; tileLabel: string; refLabel: string; ph: string; hint: string; dropTitle: string; dropSub: string; required: boolean; warn: boolean }[] = [
  {
    key: 'cash', icon: Banknote, tileLabel: 'Cash',
    refLabel: 'Receipt or slip number', ph: 'e.g. slip 041',
    hint: 'Write the number on the acknowledgment slip you gave, if there is one.',
    dropTitle: 'Photo of the signed slip', dropSub: 'A slip the member signed, or a photo of the handover',
    required: false, warn: true,
  },
  {
    key: 'gcash', icon: Smartphone, tileLabel: 'GCash',
    refLabel: 'Reference number', ph: 'e.g. 8027 4451 9032',
    hint: 'From the GCash receipt.',
    dropTitle: 'Attach the receipt', dropSub: 'A screenshot showing the amount, reference number and date',
    required: true, warn: false,
  },
  {
    key: 'bank_transfer', icon: Landmark, tileLabel: 'Bank',
    refLabel: 'Transaction reference', ph: 'e.g. TRX-88213004',
    hint: 'From the deposit slip or transfer confirmation.',
    dropTitle: 'Attach the deposit slip', dropSub: 'A photo or screenshot showing amount, date and reference',
    required: true, warn: false,
  },
  {
    key: 'other', icon: MoreHorizontal, tileLabel: 'Other',
    refLabel: 'Describe how it was received', ph: 'e.g. remittance through a relative',
    hint: 'There’s no reference number, so the description is the only identifier this entry will carry.',
    dropTitle: 'Attach whatever proof exists', dropSub: 'A photo, screenshot or written acknowledgment',
    required: true, warn: true,
  },
];

function Notice({ tone, title, body }: { tone: 'info' | 'warning' | 'danger'; title: string; body: string }) {
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: t.soft, borderRadius: 16, padding: 14 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.base, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <AlertTriangle size={12} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 12.5, color: t.text }}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{body}</Text>
      </View>
    </View>
  );
}

export default function RecordPayment() {
  const { groupId, membershipId } = useLocalSearchParams<{ groupId: string; membershipId: string }>();
  const router = useRouter();
  const { member } = useAuth();

  const { cycle } = useActiveCycle(groupId!);
  const membersQ = useQuery(() => listMembers(groupId!), [groupId]);
  const target = membersQ.data?.find((m) => m.id === membershipId) ?? null;

  const memberContribs = useContributions(groupId!, cycle?.id ? { membership_id: membershipId, cycle_id: cycle.id } : {});
  const submit = useSubmitContribution(groupId!);

  const nextEntry = useMemo(() => {
    if (!cycle || !target) return null;
    const timeline = buildTimeline(cycle, memberContribs.data ?? [], target.heads);
    return timeline.find((e) => e.kind === 'due' || e.kind === 'late') ?? null;
  }, [cycle, target, memberContribs.data]);

  const isSelf = !!target && target.member_id === member?.id;
  const expected = nextEntry?.amount ?? 0;

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // `expected` only resolves once cycle/roster/this member's contributions have
  // all loaded (three separate async fetches) — a lazy useState initializer
  // would run before any of that settles and never gets a second chance, so
  // the field prefill needs to react to the data actually arriving instead.
  useEffect(() => {
    if (expected > 0 && !amount) setAmount(String(expected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expected]);

  const methodCfg = METHODS.find((m) => m.key === method)!;
  const amtNum = toAmountString(amount) ? Number(toAmountString(amount)) : 0;
  const mismatch = amtNum > 0 && expected > 0 && Math.abs(amtNum - expected) > 0.01;
  const needsRef = methodCfg.required && !reference.trim();

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!cycle || !target) return;
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter the amount received.');
    if (needsRef) return Alert.alert('Reference needed', `Enter a ${methodCfg.refLabel.toLowerCase()}.`);
    setSaving(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'contribution');
      const ok = await submit.run({
        cycle_id: cycle.id,
        membership_id: target.id,
        amount: amt,
        payment_method: method,
        external_reference: reference || undefined,
        proof_url,
      });
      if (ok !== undefined) {
        Alert.alert('Recorded', `${target.members?.full_name ?? 'Member'}'s payment of ${formatPeso(amt)} was submitted — another officer needs to confirm it before it posts.`);
        router.back();
      } else if (submit.error) {
        Alert.alert('Could not record', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const disabled = !amtNum || needsRef || !target || !cycle;
  const barNote = !amtNum ? 'Enter the amount received'
    : needsRef ? `A ${methodCfg.refLabel.toLowerCase()} is required`
    : 'Goes to another officer for confirmation';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Record a payment" subtitle="For money received outside the app" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">

        {!target || !cycle || membersQ.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : (
          <>
            {/* ---------------- Who + expected ---------------- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <Avatar name={target.members?.full_name ?? 'Member'} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" style={{ fontSize: 16.5 }} numberOfLines={1}>{target.members?.full_name ?? 'Member'}</Text>
                <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>
                  {target.heads} head{target.heads === 1 ? '' : 's'}{isSelf ? ' · you' : ''}
                </Text>
              </View>
            </View>

            <View style={[{ padding: 14, flexDirection: 'row', alignItems: 'baseline' }, cardStyle]}>
              <View>
                <Text variant="label" style={{ fontSize: 12.5, color: semantic.textSecondary }}>Expected</Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
                  {nextEntry ? `Recording against ${periodLabel(nextEntry.periodStart, cycle.frequency, true)}` : 'No open period for this cycle'}
                </Text>
              </View>
              <Text style={{ marginLeft: 'auto', fontSize: 19, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(expected)}</Text>
            </View>

            {isSelf ? (
              <Notice tone="warning" title="You're recording your own payment" body="That's allowed, but you can't be the one who confirms it — it waits for a different officer to approve, same as any other entry." />
            ) : null}

            {/* ---------------- What was paid ---------------- */}
            <View>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>What was paid</Text>
              <View style={[cardStyle, { padding: 13, gap: 4 }]}>
                <Text variant="overline" color="secondary" style={{ marginBottom: 6 }}>Amount received</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 52 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary, marginRight: 6 }}>₱</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    placeholder={String(expected)}
                    placeholderTextColor={semantic.textMuted}
                    style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}
                  />
                </View>
              </View>

              {mismatch ? (
                <View style={{ marginTop: 10 }}>
                  <Notice
                    tone="warning"
                    title={`${formatPeso(Math.abs(amtNum - expected))} ${amtNum < expected ? 'less' : 'more'} than expected`}
                    body={`Expected ${formatPeso(expected)}, entering ${formatPeso(amtNum)}. It posts exactly as entered — double-check before recording.`}
                  />
                </View>
              ) : null}
            </View>

            {/* ---------------- How it was received ---------------- */}
            <View>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>How it was received</Text>
              <View style={[cardStyle, { padding: 13, gap: 13 }]}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {METHODS.map((m) => {
                    const active = method === m.key;
                    return (
                      <Pressable key={m.key} onPress={() => { setMethod(m.key); setReference(''); }} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: active ? semantic.surface : semantic.surfaceAlt, borderWidth: 1.5, borderColor: active ? semantic.brandDark : 'transparent' }}>
                        <m.icon size={19} color={active ? semantic.brandDark : semantic.textSecondary} strokeWidth={1.8} />
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: active ? semantic.dashCard : semantic.textSecondary, marginTop: 6 }}>{m.tileLabel}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View>
                  <Text variant="overline" color="secondary" style={{ marginBottom: 6 }}>
                    {methodCfg.refLabel}{methodCfg.required ? <Text style={{ color: intent.danger.text }}> *</Text> : null}
                  </Text>
                  <TextInput
                    value={reference}
                    onChangeText={setReference}
                    placeholder={methodCfg.ph}
                    placeholderTextColor={semantic.textMuted}
                    style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 48, fontFamily: 'Poppins_500Medium', fontSize: 14, color: semantic.textPrimary }}
                  />
                  <Text variant="caption" color="secondary" style={{ marginTop: 6, lineHeight: 16 }}>{methodCfg.hint}</Text>
                </View>

                <Pressable onPress={pickProof} style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: semantic.borderStrong, borderRadius: 16, padding: 16, alignItems: 'center' }}>
                  {proofUri ? (
                    <Image source={{ uri: proofUri }} style={{ width: '100%', height: 140, borderRadius: 10 }} resizeMode="cover" />
                  ) : (
                    <>
                      <Camera size={22} color={semantic.brand} />
                      <Text variant="label" style={{ fontSize: 12.5, marginTop: 7 }}>{methodCfg.dropTitle}</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 3, textAlign: 'center', lineHeight: 15 }}>{methodCfg.dropSub}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>

            {/* ---------------- Notices ---------------- */}
            <Notice tone="info" title="Recorded by you, confirmed by another officer" body="Nothing posts to the ledger until a different officer confirms it. Your name stays on the entry permanently." />
            {methodCfg.warn ? (
              <Notice tone="danger" title={method === 'cash' ? 'Cash has no external record' : 'No reference number for this entry'} body="Attach a photo of a signed slip or write down how it was received — without something, this posting rests on your word alone." />
            ) : null}

            <Button label="Record payment" onPress={onSubmit} loading={saving} disabled={disabled} />
            <Text variant="caption" color={disabled ? 'secondary' : 'secondary'} style={{ textAlign: 'center', marginTop: -8 }}>{barNote}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
