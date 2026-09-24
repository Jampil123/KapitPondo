import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Image, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
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
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { headLabel, type PaymentMethod } from '@/api/lending';
import { useLoan, useSubmitRepayment } from '@/features/lending/lending.hooks';

const cardStyle = [{ backgroundColor: semantic.surface, borderRadius: 20 }, shadowToken.card] as const;

const METHODS: { key: PaymentMethod; icon: any; tileLabel: string; refLabel: string; ph: string; dropTitle: string; dropSub: string; required: boolean; warn: boolean }[] = [
  {
    key: 'cash', icon: Banknote, tileLabel: 'Cash',
    refLabel: 'Receipt or slip number', ph: 'e.g. slip 041',
    dropTitle: 'Photo of the signed slip', dropSub: 'A slip the member signed, or a photo of the handover',
    required: false, warn: true,
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
  const { role } = useActiveGroup();
  // Backend rule (migration 0062): a Treasurer's entry must be confirmed by the Owner.
  const confirmer = role === 'treasurer' ? 'the Organizer' : 'another officer';

  const { data, loading } = useLoan(groupId!, loanId);
  const loan = data?.loan ?? null;
  const submit = useSubmitRepayment(groupId!);

  const isSelf = !!loan && loan.membership?.member_id === member?.id;
  const outstanding = Number(loan?.outstanding_balance ?? 0);
  const rate = Number(loan?.interest_rate ?? 0);

  const [amount, setAmount] = useState('');
  // Walk-in payments are almost always cash, so there's no method picker.
  const method: PaymentMethod = 'cash';
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
        Alert.alert('Recorded', `${loan.membership?.members?.full_name ?? 'Member'}'s repayment of ${formatPeso(amt)} was submitted for ${confirmer} to confirm.`);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title="Record a repayment" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">

        {loading || !loan ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <Avatar name={loan.membership?.members?.full_name ?? 'Member'} uri={loan.membership?.members?.avatar_url} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" style={{ fontSize: 16.5 }} numberOfLines={1}>{loan.membership?.members?.full_name ?? 'Member'}</Text>
                {loan.head_no > 1 ? <Text variant="caption" color="secondary">{headLabel(loan.head_no, loan.head_name)}</Text> : null}
                <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>
                  {formatPeso(outstanding)} outstanding{isSelf ? ' · you' : ''}
                </Text>
              </View>
            </View>

            {isSelf ? (
              <Notice tone="warning" title="You're recording your own repayment" body={`You can't confirm it yourself — ${confirmer} will.`} />
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
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Cash receipt</Text>
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


            <Button label="Record repayment" onPress={onSubmit} loading={saving} disabled={disabled} />
            <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: -8 }}>
              {!amtNum ? 'Enter the amount received' : needsRef ? `A ${methodCfg.refLabel.toLowerCase()} is required` : `Goes to ${confirmer} for confirmation`}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
