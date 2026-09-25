import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Image, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Banknote, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useQuery } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { listMembers } from '@/api/groups';
import type { PaymentMethod } from '@/api/contributions';
import { useContributions, useSubmitContribution } from '@/features/contributions/contributions.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { buildTimeline, periodLabel } from '@/features/contributions/periods';

const cardStyle = [{ backgroundColor: semantic.surface, borderRadius: 20 }, shadowToken.card] as const;

const METHODS: { key: PaymentMethod; icon: any; tileLabel: string; refLabel: string; ph: string; dropTitle: string; dropSub: string; required: boolean; warn: boolean }[] = [
  {
    key: 'cash', icon: Banknote, tileLabel: 'Cash',
    refLabel: 'Receipt or slip number', ph: 'e.g. slip 041',
    dropTitle: 'Photo of the signed slip', dropSub: 'The Auditor checks against this. No slip? A receipt number is generated for you.',
    required: false, warn: true,
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
  const { role } = useActiveGroup();
  // Backend rule (migration 0062): a Treasurer's entry must be confirmed by the Owner.
  const confirmer = role === 'treasurer' ? 'the Organizer' : 'another officer';

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
  // Walk-in payments are almost always cash, so there's no method picker.
  const method: PaymentMethod = 'cash';
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
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
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
        // Nothing posts on recording (migration 0075): it waits for a confirmation and/or the Auditor's verification.
        toast(isSelf
          ? `Submitted for ${confirmer} to confirm`
          : ok.contribution?.status === 'confirmed'
            ? `${formatPeso(amt)} recorded — waiting for the Auditor’s verification`
            : `${formatPeso(amt)} recorded — waiting for the Treasurer to confirm`);
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
    : isSelf ? `Goes to ${confirmer} for confirmation` : 'Posts to the ledger right away';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title="Record a payment" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">

        {!target || !cycle || membersQ.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : (
          <>
            {/* ---------------- Who + expected ---------------- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <Avatar name={target.members?.full_name ?? 'Member'} uri={target.members?.avatar_url} size={48} />
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
              <Notice tone="warning" title="You're recording your own payment" body={`You can't confirm it yourself — ${confirmer} will.`} />
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
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Cash acknowledgment slip</Text>
              <View style={[cardStyle, { padding: 13, gap: 13 }]}>
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

            <Button label="Record payment" onPress={onSubmit} loading={saving} disabled={disabled} />
            <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: -8 }}>{barNote}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
