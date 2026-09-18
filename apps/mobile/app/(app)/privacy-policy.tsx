import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';
import {
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_SECTIONS,
} from '@/content/privacyPolicy';

const BAND_TOP = '#4C7C90';

export default function PrivacyPolicy() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Privacy Policy" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <Text variant="h1" style={{ fontSize: 19, marginBottom: 4 }}>{PRIVACY_POLICY_TITLE}</Text>
        <Text variant="caption" color="secondary" style={{ marginBottom: 18 }}>Effective {PRIVACY_POLICY_EFFECTIVE_DATE}</Text>

        <Text variant="body" color="secondary" style={{ marginBottom: 22 }}>{PRIVACY_POLICY_INTRO}</Text>

        {PRIVACY_POLICY_SECTIONS.map((section) => (
          <View key={section.heading} style={{ marginBottom: 22 }}>
            <Text variant="label" style={{ fontSize: 14, marginBottom: 6 }}>{section.heading}</Text>
            <Text variant="body" color="secondary" style={{ lineHeight: 21 }}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
