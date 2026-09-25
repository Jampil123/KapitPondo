import { useState } from 'react';
import { View, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { semantic, shadowToken } from '@/theme/colors';
import { entryRef } from '@/api/ledger';
import { useFlags } from '@/features/flags/flags.hooks';
import { useSubmitFinding } from '@/features/findings/findings.hooks';
import { recordLabel } from '@/features/flags/flagStatus';

/** The Auditor's formal finding for the Organizer — a page, since it's written with care, not dashed off. */
export default function NewAuditFinding() {
  const { groupId, flagId } = useLocalSearchParams<{ groupId: string; flagId?: string }>();
  const router = useRouter();
  const flags = useFlags(groupId!, 'open');
  const submit = useSubmitFinding(groupId!);

  const [title, setTitle] = useState('');
  const [found, setFound] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [linked, setLinked] = useState<string[]>(flagId ? [flagId] : []);
  const openFlags = flags.data ?? [];

  const toggle = (id: string) => setLinked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function onSubmit() {
    const ok = await submit.run({
      title: title.trim(),
      details: found.trim() || undefined,
      recommendation: recommendation.trim() || undefined,
      severity: 'medium',
      flag_ids: linked,
    });
    if (ok === undefined) {
      Alert.alert('Could not submit', submit.error?.message ?? 'Try again.');
      return;
    }
    toast('Finding submitted to the Organizer');
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <CloseHeader title="New audit finding" onClose={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Field
            label="Title"
            placeholder="e.g. Loan approved with a missed check"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />

          <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500', marginBottom: 7 }}>Linked flags</Text>
          <View style={[{ backgroundColor: semantic.card, borderRadius: 14, marginBottom: 15, overflow: 'hidden' }, shadowToken.soft]}>
            {flags.loading && openFlags.length === 0 ? (
              <ActivityIndicator color={semantic.brand} style={{ margin: 14 }} />
            ) : openFlags.length === 0 ? (
              <Text variant="caption" color="muted" style={{ padding: 14 }}>No open flags to link.</Text>
            ) : openFlags.map((f, i) => (
              <View key={f.id} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i < openFlags.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <Checkbox
                  checked={linked.includes(f.id)}
                  onToggle={() => toggle(f.id)}
                  label={
                    <>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{f.ref} · {f.reason}{'\n'}</Text>
                      <Text variant="caption" color="secondary">
                        {f.record.entry_no ? `${entryRef({ entry_no: f.record.entry_no })}, ` : ''}{recordLabel(f)}
                      </Text>
                    </>
                  }
                />
              </View>
            ))}
          </View>

          <Field
            label="What you found"
            placeholder="Describe the issue and which records it affects."
            value={found}
            onChangeText={setFound}
            multiline
            style={{ minHeight: 88, textAlignVertical: 'top' }}
          />
          <Field
            label="Recommendation"
            placeholder="What should the Organizer or Treasurer do next?"
            value={recommendation}
            onChangeText={setRecommendation}
            multiline
            style={{ minHeight: 88, textAlignVertical: 'top' }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <ShieldCheck size={13} color={semantic.textMuted} />
            <Text variant="caption" color="muted" style={{ flex: 1 }}>Goes to the Organizer. Only they can close it.</Text>
          </View>

          <Button label="Submit to Organizer" onPress={onSubmit} loading={submit.loading} disabled={!title.trim()} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
