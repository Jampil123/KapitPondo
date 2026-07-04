/**
 * app/(app)/[groupId]/expenses/record.tsx — treasurer records a group expense
 * (M7). Wired to recordExpense; lists recent expenses via useExpenses. The
 * auditor confirms it afterward (recorder != approver).
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Minus, Camera } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useExpenses, useRecordExpense } from '@/features/expenses/expenses.hooks';

const CATEGORIES = ['Meeting', 'Supplies', 'Bank charges', 'Other'];

export default function RecordExpense() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const list = useExpenses(groupId!, {});
  const record = useRecordExpense(groupId!);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Meeting');
  const [amount, setAmount] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = (list.data ?? []).reduce((a, e) => a + Number(e.amount || 0), 0);

  async function pickReceipt() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach a receipt.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSave() {
    const amt = toAmountString(amount);
    if (!title.trim() || !amt) return Alert.alert('Missing info', 'Enter a title and a valid amount.');
    setBusy(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'expense');
      const ok = await record.run({ amount: amt, category, description: title.trim(), proof_url });
      if (ok !== undefined) {
        Alert.alert('Saved', 'Expense recorded. It needs the auditor to confirm.');
        setTitle(''); setAmount(''); setProofUri(null); list.refetch();
      } else if (record.error) Alert.alert('Could not save', record.error.message);
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Record Expenses" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" color="secondary">Expenses so far</Text>
            <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(total)}</Text>
          </View>
          <Minus size={24} color="#C25C5E" />
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
          <Field label="Expense title" placeholder="e.g. Meeting venue rental" value={title} onChangeText={setTitle} />
          <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 2 }}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, backgroundColor: category === c ? semantic.textPrimary : semantic.surfaceAlt }}>
                <Text variant="caption" style={{ color: category === c ? '#fff' : semantic.textSecondary }}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Field label="Amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" />

          <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 2 }}>Receipt</Text>
          <Pressable onPress={pickReceipt} style={{ alignItems: 'center', gap: 8, borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 14, paddingVertical: 18, backgroundColor: semantic.surfaceAlt }}>
            {proofUri ? <Image source={{ uri: proofUri }} style={{ width: '92%', height: 140, borderRadius: 10 }} resizeMode="cover" /> : (
              <><Camera size={22} color={semantic.brandDark} /><Text variant="bodySmall" color="secondary">Attach receipt</Text></>
            )}
          </Pressable>
        </View>

        <View style={{ marginTop: 8 }}>
          <Button label="Save expense" onPress={onSave} loading={record.loading || busy} />
        </View>

        <Text variant="h3" style={{ fontSize: 15, marginTop: 22, marginBottom: 12 }}>Recent expenses</Text>
        {list.loading ? <ActivityIndicator color={semantic.brand} /> : (list.data?.length ?? 0) === 0 ? (
          <Text variant="body" color="muted">No expenses yet.</Text>
        ) : (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 6 }, shadowToken.card]}>
            {list.data!.map((e, i, a) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < a.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{e.description ?? 'Expense'}</Text>
                  <Text variant="caption" color="secondary">{e.category ?? 'Other'}</Text>
                </View>
                <StatusBadge entity="expense" value={e.status} />
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: '#C25C5E' }}>-{formatPeso(e.amount).replace('₱', '₱')}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
