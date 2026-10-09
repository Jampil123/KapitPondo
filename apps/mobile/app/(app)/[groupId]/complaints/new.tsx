import { useState } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent } from '@/theme/colors';
import { useQuery } from '@/hooks/useApi';
import { useActiveGroup } from '@/context/GroupContext';
import { fileProblemReport, listProblemCategories, type ProblemCategory } from '@/api/problemReports';

export default function NewComplaint() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group } = useActiveGroup();
  const categories = useQuery(listProblemCategories, []);
  const [category, setCategory] = useState<ProblemCategory | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const canSubmit = !!category && subject.trim().length > 0 && description.trim().length > 0 && !loading;

  async function onSubmit() {
    if (!canSubmit || !category) return;
    setLoading(true);
    setError(undefined);
    try {
      await fileProblemReport({ category, subject: subject.trim(), description: description.trim(), group_id: groupId });
      toast('Complaint sent.');
      router.back();
    } catch (e) {
      setError((e as Error).message || 'Could not send your complaint. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['bottom']}>
      <BandHeader title="File a complaint" subtitle={group?.name} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500', marginBottom: 9 }}>What's it about?</Text>
          {categories.loading && !categories.data ? (
            <ActivityIndicator color={semantic.brandDark} style={{ alignSelf: 'flex-start', marginBottom: 18 }} />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {(categories.data ?? []).map((c) => {
                const selected = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={{
                      backgroundColor: selected ? semantic.brand : semantic.surface,
                      borderWidth: 1, borderColor: selected ? semantic.brand : semantic.border,
                      borderRadius: 20, paddingVertical: 9, paddingHorizontal: 13,
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: selected ? '#fff' : semantic.brandDark }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Field label="Subject" placeholder="Short summary" value={subject} onChangeText={setSubject} maxLength={120} />
          <Field
            label="Details"
            placeholder="What happened, when, and who was involved?"
            value={description}
            onChangeText={(t) => { setDescription(t); if (error) setError(undefined); }}
            multiline
            numberOfLines={6}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />

          {error ? <Text variant="caption" style={{ color: intent.danger.text, marginBottom: 12 }}>{error}</Text> : null}

          <View style={{ marginTop: 8 }}>
            <Button label="Send complaint" onPress={onSubmit} loading={loading} disabled={!canSubmit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
