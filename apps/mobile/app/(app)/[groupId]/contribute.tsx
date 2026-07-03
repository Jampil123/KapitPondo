/**
 * app/(app)/[groupId]/contribute.tsx — member submits a contribution (M5).
 * Design's layout, wired to useSubmitContribution. Needs the active cycle for
 * cycle_id + default amount. Optional proof uploads to the private 'proofs'
 * bucket. The treasurer/auditor confirm it afterward (recorder != approver).
 */
import { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { CalendarDays, Hash, Camera, Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useSubmitContribution } from '@/features/contributions/contributions.hooks';
import type { PaymentMethod } from '@/api/contributions';

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'gcash', label: 'GCash' },
  { key: 'cash', label: 'Cash' },
  { key: 'bank_transfer', label: 'Bank' },
  { key: 'other', label: 'Other' },
];

export default function Contribute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { cycle, loading } = useActiveCycle(groupId!);
  const submit = useSubmitContribution(groupId!);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (cycle && !amount) setAmount(String(cycle.contribution_amount));
  }, [cycle]);

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!cycle) return Alert.alert('No active cycle', 'There is no active cycle to contribute to yet.');
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter a valid contribution amount.');
    setUploading(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'contribution');
      const ok = await submit.run({ cycle_id: cycle.id, amount: amt, payment_method: method, external_reference: reference || undefined, proof_url });
      if (ok !== undefined) {
        Alert.alert('Submitted', 'Your contribution was submitted for confirmation.');
        router.replace({ pathname: '/(app)/[groupId]', params: { groupId } });
      } else if (submit.error) {
        Alert.alert('Could not submit', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Submit Contribution" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Due hero */}
        <View style={{ borderRadius: 20, padding: 18, backgroundColor: semantic.brand, marginBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 3 }}>
            <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>This period’s contribution</Text>
            {loading ? <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start' }} /> : (
              <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{cycle ? formatPeso(cycle.contribution_amount) : '—'}</Text>
            )}
            <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>{cycle ? `${cycle.name} · ${cycle.frequency}` : 'No active cycle'}</Text>
          </View>
          <CalendarDays size={30} color="rgba(255,255,255,0.85)" />
        </View>

        <Field label="Amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />

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
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>The treasurer will confirm your contribution.</Text>
        </View>

        <Button label="Submit contribution" onPress={onSubmit} loading={submit.loading || uploading} disabled={!cycle} />
      </ScrollView>
    </SafeAreaView>
  );
}
