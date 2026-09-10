/**
 * app/(app)/verify-landing.tsx — "Verify your identity" fork, shown right
 * after OTP confirms the phone. Matches the prototype's screen 1 (intro):
 * badge, headline, 3-item checklist, privacy note, Start verification /
 * Do it later. Lives under (app), not (auth) — this screen is shown to an
 * already signed-in user, so it must not be under (auth) or the root
 * auth-guard bounces it straight back to /(app)/groups.
 */
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IdCard, Camera, ClipboardCheck, ShieldCheck, Clock, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';

const STEPS = [
  { icon: IdCard, title: 'Take a photo of your ID', sub: "Choose from PhilID, driver's license, passport, UMID, or postal ID." },
  { icon: Camera, title: 'Take a selfie', sub: 'A clear photo of your face so we can match it against your ID.' },
  { icon: ClipboardCheck, title: 'Confirm your details', sub: "We'll read the info from your ID automatically. You just check that it's right." },
];

export default function VerifyLanding() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        <View style={{ marginTop: 4, marginBottom: 22 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              backgroundColor: semantic.surfaceAlt,
              borderRadius: 100,
              paddingVertical: 6,
              paddingHorizontal: 11,
              marginBottom: 14,
            }}
          >
            <Clock size={13} color={semantic.brandDark} />
            <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '700' }}>Takes about 3 minutes</Text>
          </View>
          <Text variant="h1" style={{ fontSize: 24, lineHeight: 30, marginBottom: 10 }}>
            A valid ID unlocks loans and full access.
          </Text>
          <Text variant="body" color="secondary" style={{ lineHeight: 21 }}>
            You can already{' '}
            <Text variant="body" style={{ fontWeight: '700', color: semantic.textPrimary }}>join a group</Text>
            {' '}and{' '}
            <Text variant="body" style={{ fontWeight: '700', color: semantic.textPrimary }}>make deposits</Text>
            {' '}without verifying. To request a loan, create a group, or hold an officer role, verify your identity first.
          </Text>
        </View>

        <View style={{ gap: 12, marginBottom: 18 }}>
          {STEPS.map((s) => (
            <View
              key={s.title}
              style={{
                flexDirection: 'row',
                gap: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: semantic.border,
                borderRadius: 16,
                backgroundColor: semantic.surface,
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={18} color={semantic.brandDark} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" style={{ fontSize: 13 }}>{s.title}</Text>
                <Text variant="caption" color="secondary" style={{ lineHeight: 16 }}>{s.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 26 }}>
          <Lock size={14} color={semantic.textMuted} style={{ marginTop: 1 }} />
          <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 16 }}>
            Your photos and info are used only for verification. They're encrypted at rest and only the KapitPondo Sysadmin can view them during review.
          </Text>
        </View>

        <Button label="Start verification" onPress={() => router.push('/(app)/identity' as any)} leading={<ShieldCheck size={18} color="#fff" />} />
        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <Button
            label="Do it later"
            variant="ghost"
            bordered={false}
            onPress={() => router.replace('/(app)/groups' as any)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
