import { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { CheckCircle2, Bug, Sparkles, MessageSquare, MoreHorizontal } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { sendFeedback, type FeedbackCategory } from '@/api/feedback';

const BAND_TOP = '#4C7C90';

const CATEGORIES: { key: FeedbackCategory; label: string; icon: any }[] = [
  { key: 'bug', label: 'Bug report', icon: Bug },
  { key: 'feature', label: 'Feature request', icon: Sparkles },
  { key: 'general', label: 'General feedback', icon: MessageSquare },
  { key: 'other', label: 'Something else', icon: MoreHorizontal },
];

export default function SendFeedback() {
  const router = useRouter();
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);

  const messageError = touched && message.trim().length === 0 ? 'Please write a message.' : undefined;
  const canSubmit = category !== null && message.trim().length > 0 && !loading;

  async function onSubmit() {
    setTouched(true);
    if (!canSubmit || !category) return;
    setLoading(true);
    setError(undefined);
    try {
      await sendFeedback({
        category,
        message: message.trim(),
        app_version: Constants.expoConfig?.version,
        platform: Platform.OS,
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message || 'Could not send your feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <CheckCircle2 size={52} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 22, textAlign: 'center', marginBottom: 32 }}>Thanks for the feedback</Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Done" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BAND_TOP }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
        <AppBar title="Send Feedback" backgroundColor={BAND_TOP} tintColor="#fff" />
        <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500', marginBottom: 9 }}>
            What's this about?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {CATEGORIES.map((c) => {
              const selected = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: selected ? semantic.brand : semantic.surface,
                    borderWidth: 1, borderColor: selected ? semantic.brand : semantic.border,
                    borderRadius: 20, paddingVertical: 9, paddingHorizontal: 13,
                  }}
                >
                  <c.icon size={14} color={selected ? '#fff' : semantic.brandDark} />
                  <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: selected ? '#fff' : semantic.brandDark }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Your message"
            placeholder="What happened, or what would you like to see?"
            value={message}
            onChangeText={(t) => { setMessage(t); if (error) setError(undefined); }}
            onBlur={() => setTouched(true)}
            error={messageError}
            multiline
            numberOfLines={5}
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />

          {error ? (
            <Text variant="caption" style={{ color: intent.danger.text, marginBottom: 12 }}>{error}</Text>
          ) : null}

          <View style={{ marginTop: 8 }}>
            <Button label="Send Feedback" onPress={onSubmit} loading={loading} disabled={!canSubmit} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
