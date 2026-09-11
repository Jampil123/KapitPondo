/**
 * app/(app)/[groupId]/loans/record.tsx — Treasurer records a single member's
 * loan repayment (cash/GCash/bank received outside the app). Mirrors
 * contributions/record.tsx: submits a claim (status 'submitted', tagged
 * is_walk_in) instead of posting instantly — a DIFFERENT officer must
 * confirm it via confirm_loan_repayment before it reaches the ledger (see
 * migration 0045). When the recorder holds the Treasurer role specifically,
 * that confirmer must be the Auditor.
 *
 * The interest-first allocation preview shown here is the REAL formula from
 * confirm_loan_repayment (checked before building):
 *   interest  = min(round(outstanding_balance * interest_rate, 2), amount)
 *   principal = min(amount - interest, outstanding_balance)
 * computed live client-side so the Treasurer can check it against the proof
 * before submitting — the server recomputes it independently at confirm
 * time (it doesn't trust this preview), so it can't drift out of sync.
 */
import { useMemo, useState } from 'react';
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
import { useAuth } from '@/context/AuthContext';
import type { PaymentMethod } from '@/api/lending';
import { useLoan, useSubmitRepayment } from '@/features/lending/lending.hooks';

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

function Notice({ tone, title, body }: { tone: 'info' | 'warning' | 'danger' | 'success'; title: string; body: string }) {
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

function AllocRow({ label, value, tone }: { label: string; value: string; tone?: 'int' | 'pri' | 'bal' }) {
  const color = tone === 'int' ? intent.warning.text : tone === 'pri' ? semantic.brandDark : semantic.textPrimary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 }}>
      <Text variant="caption" color="secondary" style={{ fontWeight: tone === 'bal' ? '700' : '500' }}>{label}</Text>
      <Text style={{ marginLeft: 'auto', fontFamily: tone === 'bal' ? 'Poppins_700Bold' : 'Poppins_600SemiBold', fontSize: tone === 'bal' ? 14.5 : 12.5, color }}>{value}</Text>
    </View>
  );
}

export default function RecordLoanRepayment() {
  const { groupId, loanId } = useLocalSearchParams<{ groupId: string; loanId: string }>();
  const router = useRouter();
  const { member } = useAuth();

  const { data, loading } = useLoan(groupId!, loanId);
  const loan = data?.loan ?? null;
  const submit = useSubmitRepayment(groupId!);

  const isSelf = !!loan && loan.membership?.member_id === member?.id;
  const outstanding = Number(loan?.outstanding_balance ?? 0);
  const rate = Number(loan?.interest_rate ?? 0);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const methodCfg = METHODS.find((m) => m.key === method)!;
  const amtNum = toAmountString(amount) ? Number(toAmountString(amount)) : 0;

  const alloc = useMemo(() => {
    if (!amtNum) return null;
    const interest = Math.min(Math.round(outstanding * rate * 100) / 100, amtNum);
    const principal = Math.min(amtNum - interest, outstanding);
    const balanceAfter = Math.max(outstanding - principal, 0);
    return { interest, principal, balanceAfter, settles: balanceAfter <= 0.01 };
  }, [amtNum, outstanding, rate]);

  const needsRef = methodCfg.required && !reference.trim();

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!loan) return;
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter the amount received.');
    if (needsRef) return Alert.alert('Reference needed', `Enter a ${methodCfg.refLabel.toLowerCase()}.`);
    setSaving(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'repayment');
      const ok = await submit.run(loan.id, {
        amount: amt,
        payment_method: method,
        external_reference: reference || undefined,
        proof_url,
      });
      if (ok !== undefined) {
        Alert.alert('Recorded', `${loan.membership?.members?.full_name ?? 'Member'}'s repayment of ${formatPeso(amt)} was submitted — the Auditor needs to confirm it before it posts.`);
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

  const disabled = !amtNum || needsRef || !loan;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Record a repayment" subtitle="For money received outside the app" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">

        {loading || !loan ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <Avatar name={loan.membership?.members?.full_name ?? 'Member'} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" style={{ fontSize: 16.5 }} numberOfLines={1}>{loan.membership?.members?.full_name ?? 'Member'}</Text>
                <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>
                  {formatPeso(outstanding)} outstanding{isSelf ? ' · you' : ''}
                </Text>
              </View>
            </View>

            {isSelf ? (
              <Notice tone="warning" title="You're recording your own repayment" body="That's allowed, but you can't be the one who confirms it — a repayment you record always waits for the Auditor to approve." />
            ) : null}

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
                    placeholder={String(outstanding)}
                    placeholderTextColor={semantic.textMuted}
                    style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}
                  />
                </View>
              </View>

              {alloc ? (
                <View style={[{ marginTop: 10, padding: 13 }, cardStyle, alloc.settles ? { borderWidth: 1.5, borderColor: intent.success.base } : undefined]}>
                  {alloc.settles ? (
                    <View style={{ marginBottom: 10, backgroundColor: intent.success.soft, borderRadius: 10, padding: 10 }}>
                      <Text variant="label" style={{ fontSize: 12, color: intent.success.text }}>This settles the loan</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 15 }}>After this payment, {loan.membership?.members?.full_name ?? 'they'} owe nothing — the loan closes and they become eligible to borrow again.</Text>
                    </View>
                  ) : null}
                  <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>How this will be applied</Text>
                  <AllocRow label="Interest first" value={formatPeso(alloc.interest)} tone="int" />
                  <AllocRow label="Then principal" value={formatPeso(alloc.principal)} tone="pri" />
                  <View style={{ borderTopWidth: 1, borderColor: semantic.border, marginTop: 6, paddingTop: 6 }}>
                    <AllocRow label="Balance after" value={alloc.settles ? `${formatPeso(0)} · settled` : formatPeso(alloc.balanceAfter)} tone="bal" />
                  </View>
                </View>
              ) : null}
            </View>

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

            <Notice tone="info" title="Recorded by you, confirmed by the Auditor" body="A repayment you record must be confirmed by the Auditor before it posts to the ledger. Your name stays on the entry permanently." />
            {methodCfg.warn ? (
              <Notice tone="danger" title={method === 'cash' ? 'Cash has no external record' : 'No reference number for this entry'} body="Attach a photo of a signed slip or write down how it was received — without something, this posting rests on your word alone." />
            ) : null}

            <Button label="Record repayment" onPress={onSubmit} loading={saving} disabled={disabled} />
            <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: -8 }}>
              {!amtNum ? 'Enter the amount received' : needsRef ? `A ${methodCfg.refLabel.toLowerCase()} is required` : 'Goes to the Auditor for confirmation'}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
