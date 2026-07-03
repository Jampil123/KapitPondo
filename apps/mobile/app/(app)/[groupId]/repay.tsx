/**
 * app/(app)/[groupId]/repay.tsx — member records a loan repayment (M6).
 * Shows the member's active loan, then submits a repayment via recordRepayment.
 *
 * RBAC NOTE: our recordRepayment route is treasurer/owner. If the API keeps
 * repayment recording officer-only, the member-submit path needs a backend
 * adjustment (member submits proof -> pending repayment). Wired here to
 * recordRepayment; a 403 surfaces as an alert until that's settled.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Hash, Camera, TrendingUp } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useLoans, useRecordRepayment } from '@/features/lending/lending.hooks';

export default function Repay() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const loans = useLoans(groupId!, { status: 'active' });
  const repay = useRecordRepayment(groupId!);

  const loan = loans.data?.[0] ?? null; // the member's active loan
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const outstanding = Number(loan?.outstanding_balance ?? 0);
  const newBal = useMemo(() => Math.max(0, outstanding - Number(toAmountString(amount) ?? 0)), [outstanding, amount]);

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!loan) return;
    const amt = toAmountString(amount);
    if (!amt || Number(amt) <= 0) return Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
    setBusy(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'repayment');
      const ok = await repay.run(loan.id, { amount: amt, external_reference: reference || undefined, proof_url });
      if (ok !== undefined) {
        Alert.alert('Submitted', 'Your repayment was submitted for confirmation.');
        router.replace({ pathname: '/(app)/[groupId]', params: { groupId } });
      } else if (repay.error) {
        Alert.alert('Could not submit', repay.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Repay Loan" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {loans.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : !loan ? (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 16 }}>No active loan</Text>
            <Text variant="body" color="secondary">You have nothing to repay right now.</Text>
          </View>
        ) : (
          <>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18, gap: 12 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 2 }}>
                  <Text variant="caption" color="secondary">Active loan</Text>
                  <Text variant="label" style={{ fontSize: 14.5 }}>{loan.purpose ?? 'Loan'}</Text>
                </View>
                <StatusBadge entity="loan" value={loan.status} />
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="caption" color="secondary">Remaining balance</Text>
                <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(outstanding)}</Text>
              </View>
            </View>

            <Text variant="h3" style={{ fontSize: 15, marginBottom: 12 }}>Record a repayment</Text>
            <Field label="Amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <Field label="Reference number" placeholder="Enter reference no." value={reference} onChangeText={setReference} leading={<Hash size={18} color={semantic.textMuted} />} />

            <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 2 }}>Proof of payment</Text>
            <Pressable onPress={pickProof} style={{ alignItems: 'center', gap: 8, borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 14, paddingVertical: 20, backgroundColor: semantic.surfaceAlt, marginBottom: 16 }}>
              {proofUri ? <Image source={{ uri: proofUri }} style={{ width: '92%', height: 150, borderRadius: 10 }} resizeMode="cover" /> : (
                <>
                  <Camera size={24} color={semantic.brandDark} />
                  <Text variant="bodySmall" color="secondary">Tap to attach proof</Text>
                </>
              )}
            </Pressable>

            {Number(toAmountString(amount) ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: '#E2F0E8', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <TrendingUp size={18} color="#3E8E66" />
                <Text variant="bodySmall" style={{ color: '#3E8E66', fontWeight: '600' }}>New remaining balance: {formatPeso(newBal)}</Text>
              </View>
            )}

            <Button label="Submit repayment" onPress={onSubmit} loading={repay.loading || busy} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
