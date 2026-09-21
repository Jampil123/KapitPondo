import { useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Hash, Coins } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoans, useSubmitRepayment } from '@/features/lending/lending.hooks';
import { PayLoanGcashSheet } from '@/features/lending/PayLoanGcashSheet';
import { expectedMonthlyDue } from '@/features/lending/expectedMonthlyDue';

/** Same 'choose' vs 'manual' split as contributions/contribute.tsx — pick a
 * way to pay first, then either hand off to GCash or record it yourself. */
type PayRoute = 'choose' | 'manual';

function SectionHead({ title }: { title: string }) {
  return (
    <View style={{ marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
    </View>
  );
}

export default function Repay() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { group, membership } = useActiveGroup();
  const loans = useLoans(groupId!, { status: 'active' });
  // listLoans only self-scopes server-side when role === 'member' — filter
  // here so an officer's own Member-tab submission only ever targets THEIR
  // own loan (the API rejects submitting for anyone else's anyway).
  const activeLoan = (loans.data ?? []).find((l) => l.membership_id === membership?.id) ?? null;
  const submit = useSubmitRepayment(groupId!);

  // Same routing rule as contribute.tsx: GCash is only offered once the
  // group's Owner has set a treasurer GCash number — otherwise there's
  // nothing to build the sheet against, so skip straight to manual.
  const hasTreasurerGcash = !!group?.treasurer_gcash_number;
  const [route, setRoute] = useState<PayRoute>(() => (hasTreasurerGcash ? 'choose' : 'manual'));
  const [gcashSheetOpen, setGcashSheetOpen] = useState(false);
  const [amountEdit, setAmountEdit] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const outstanding = Number(activeLoan?.outstanding_balance ?? 0);
  const suggestedAmount = expectedMonthlyDue(activeLoan);

  // The loan loads asynchronously, so show its expected payment until the user types their own amount.
  const amount = amountEdit ?? (suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '');

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!activeLoan) return;
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
    if (!proofUri) return Alert.alert('Proof required', 'Attach a photo or screenshot of your payment before submitting.');
    setUploading(true);
    try {
      const proof_url = await uploadImage('proofs', proofUri, 'repayment');
      const ok = await submit.run(activeLoan.id, { amount: amt, external_reference: reference || undefined, proof_url });
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
        <AppBar title="Repay loan" />
        <View style={[{ margin: 16, backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10 }, shadowToken.card]}>
          <Coins size={26} color={semantic.textMuted} />
          <Text variant="body" color="muted" style={{ textAlign: 'center' }}>You don't have an active loan to repay right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Repay loan" />
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

        {route === 'choose' ? (
          <>
            <SectionHead title="How would you like to pay" />
            <Button
              label={`Pay ${formatPeso(suggestedAmount)} with GCash`}
              onPress={() => setGcashSheetOpen(true)}
            />
            <Button label="I already paid — record it" variant="ghost" onPress={() => setRoute('manual')} style={{ marginTop: 10 }} />
            {suggestedAmount < outstanding ? (
              <Text variant="caption" color="muted" style={{ marginTop: 12, lineHeight: 16 }}>
                {`${formatPeso(suggestedAmount)} is this month's expected payment, not the full ${formatPeso(outstanding)} balance.`}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <SectionHead title="Proof of payment" />
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

            <Field label="Amount" prefix="₱" value={amount} onChangeText={setAmountEdit} keyboardType="numeric" />
            <Field label="Reference number" placeholder="e.g. 9921 4456 7780" value={reference} onChangeText={setReference} leading={<Hash size={18} color={semantic.textMuted} />} />

            <Button label="Submit repayment" onPress={onSubmit} loading={submit.loading || uploading} disabled={!activeLoan || !proofUri} />
            {hasTreasurerGcash ? (
              <Button label="Choose a different way to pay" variant="ghost" onPress={() => setRoute('choose')} style={{ marginTop: 10 }} />
            ) : null}
          </>
        )}
      </ScrollView>

      {activeLoan ? (
        <PayLoanGcashSheet
          visible={gcashSheetOpen}
          onClose={() => setGcashSheetOpen(false)}
          loanId={activeLoan.id}
          suggestedAmount={suggestedAmount}
          onSubmitted={() => { setGcashSheetOpen(false); router.replace({ pathname: '/(app)/[groupId]/loans', params: { groupId } }); }}
        />
      ) : null}
    </SafeAreaView>
  );
}
