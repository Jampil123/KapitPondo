import { useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Hash, Clock, Coins, Smartphone, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoans, useSubmitRepayment } from '@/features/lending/lending.hooks';
import type { PaymentMethod } from '@/api/lending';

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'gcash', label: 'GCash' },
  { key: 'cash', label: 'Cash' },
  { key: 'bank_transfer', label: 'Bank' },
  { key: 'other', label: 'Other' },
];

export default function Repay() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { membership } = useActiveGroup();
  const loans = useLoans(groupId!, { status: 'active' });
  // listLoans only self-scopes server-side when role === 'member' — filter
  // here so an officer's own Member-tab submission only ever targets THEIR
  // own loan (the API rejects submitting for anyone else's anyway).
  const activeLoan = (loans.data ?? []).find((l) => l.membership_id === membership?.id) ?? null;
  const submit = useSubmitRepayment(groupId!);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!activeLoan) return;
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
    setUploading(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'repayment');
      const ok = await submit.run(activeLoan.id, { amount: amt, payment_method: method, external_reference: reference || undefined, proof_url });
      if (ok !== undefined) {
        Alert.alert('Submitted', 'Your repayment was submitted for confirmation.');
        router.replace({ pathname: '/(app)/[groupId]/loans', params: { groupId } });
      } else if (submit.error) {
        Alert.alert('Could not submit', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (!loans.loading && !activeLoan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Repay a Loan" subtitle="Member" />
        <View style={[{ margin: 16, backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10 }, shadowToken.card]}>
          <Coins size={26} color={semantic.textMuted} />
          <Text variant="body" color="muted" style={{ textAlign: 'center' }}>You don't have an active loan to repay right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const outstanding = Number(activeLoan?.outstanding_balance ?? 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Repay a Loan" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ borderRadius: 20, padding: 18, backgroundColor: semantic.brand, marginBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 3 }}>
            <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Outstanding balance</Text>
            {loans.loading ? <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start' }} /> : (
              <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(outstanding)}</Text>
            )}
            <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>{activeLoan?.purpose ?? 'Active loan'}</Text>
          </View>
          <Coins size={30} color="rgba(255,255,255,0.85)" />
        </View>

        <Pressable
          onPress={() => Alert.alert('Coming soon', 'Automatic GCash payments aren\'t available yet — for now, submit your payment details and proof below.')}
          style={[{
            flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 18,
            backgroundColor: semantic.surface, borderWidth: 1.5, borderColor: semantic.brand, borderStyle: 'dashed',
          }, shadowToken.card]}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Smartphone size={20} color={semantic.brandDark} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="label" style={{ fontSize: 13.5 }}>Pay with GCash</Text>
            <Text variant="caption" color="secondary">Automatic — no reference number or proof needed</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: semantic.surfaceAlt, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Sparkles size={11} color={semantic.brandDark} />
            <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '600', fontSize: 10.5 }}>Soon</Text>
          </View>
        </Pressable>

        <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 2 }}>Or submit manually</Text>

        <Field label="Amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Text variant="caption" color="muted" style={{ marginTop: -10, marginBottom: 14, marginLeft: 2 }}>
          Paying less than the full balance is fine — it goes to interest first, then principal.
        </Text>

        <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 2 }}>Payment method</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 15 }}>
          {METHODS.map((m) => {
            const active = method === m.key;
            return (
              <Pressable key={m.key} onPress={() => setMethod(m.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: active ? semantic.textPrimary : semantic.surfaceAlt }}>
                <Text variant="label" style={{ fontSize: 12.5, color: active ? '#fff' : semantic.textSecondary }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Field label="Reference number" placeholder="e.g. 9921 4456 7780" value={reference} onChangeText={setReference} leading={<Hash size={18} color={semantic.textMuted} />} />

        <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 2 }}>Proof of payment</Text>
        <Pressable onPress={pickProof} style={{ alignItems: 'center', gap: 8, borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 14, paddingVertical: 20, backgroundColor: semantic.surfaceAlt, marginBottom: 16 }}>
          {proofUri ? (
            <Image source={{ uri: proofUri }} style={{ width: '92%', height: 150, borderRadius: 10 }} resizeMode="cover" />
          ) : (
            <>
              <Camera size={24} color={semantic.brandDark} />
              <Text variant="bodySmall" color="secondary">Tap to attach a screenshot / photo</Text>
            </>
          )}
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Clock size={18} color={semantic.brandDark} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>A different officer will confirm your repayment before it posts.</Text>
        </View>

        <Button label="Submit repayment" onPress={onSubmit} loading={submit.loading || uploading} disabled={!activeLoan} />
      </ScrollView>
    </SafeAreaView>
  );
}
