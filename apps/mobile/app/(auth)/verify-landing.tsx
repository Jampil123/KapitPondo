/**
 * app/(auth)/verify-landing.tsx — "You're in!" verify-now / do-it-later fork
 * (prototype screen 4). Verify Now → identity; Do it later → app dashboard.
 *
 * NOTE: the prototype's benefit copy (savings account, credit card, ₱250k loans,
 * wallet limits) is generic fintech text and does NOT match KapitPondo's actual
 * verified-tier unlocks (§1.3: create a group, request a loan, become an
 * officer). Reproduced faithfully here — revise the copy when you're ready.
 */
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BadgeCheck, Gift, ChevronRight, ShieldCheck, Sparkles,
  IdCard, Video, Pencil, Landmark, CreditCard, Banknote, Wallet,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic, shadowToken } from '@/theme/colors';

const STEPS = [
  { icon: IdCard, title: 'Submit an ID', sub: 'A valid government-issued ID' },
  { icon: Video, title: 'Record a Video', sub: 'A quick selfie video for liveness' },
  { icon: Pencil, title: 'Enter your Information', sub: 'Confirm your personal details' },
];
const BENEFITS = [
  { icon: Landmark, label: 'Open a Savings Account' },
  { icon: CreditCard, label: 'Apply for a Credit Card' },
  { icon: Banknote, label: 'Loans up to ₱250,000' },
  { icon: Wallet, label: 'Increased Wallet Limits' },
];

export default function VerifyLanding() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        <View style={{ alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 18 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <BadgeCheck size={34} color="#3E8E66" />
          </View>
          <Text variant="h1" style={{ fontSize: 21, textAlign: 'center' }}>You're in! Welcome to KapitPondo.</Text>
          <Text variant="body" color="secondary">You now own a Basic account.</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: semantic.borderStrong, borderRadius: 14, padding: 13, marginBottom: 22 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Gift size={22} color={semantic.brandDark} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="label">Got an invite code?</Text>
            <Text variant="caption" color="brand" style={{ fontWeight: '600' }}>Enter Code</Text>
          </View>
          <ChevronRight size={18} color={semantic.textSecondary} />
        </View>

        <View style={{ gap: 3, marginBottom: 14 }}>
          <Text variant="h3" style={{ fontSize: 16.5 }}>Upgrade now for FREE</Text>
          <Text variant="body" color="secondary">Complete one quick verification step to unlock all KapitPondo features.</Text>
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 6, marginBottom: 22 }, shadowToken.card]}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: i < STEPS.length - 1 ? 1 : 0, borderBottomColor: semantic.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={21} color={semantic.brandDark} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" style={{ fontSize: 14 }}>{s.title}</Text>
                <Text variant="caption" color="secondary">{s.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Sparkles size={18} color={semantic.brand} />
          <Text variant="h3" style={{ fontSize: 16.5 }}>Unlock everything on KapitPondo</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginBottom: 24 }}>
          {BENEFITS.map((b) => (
            <View key={b.label} style={[{ width: '47%', flexGrow: 1, gap: 9, backgroundColor: semantic.surface, borderRadius: 14, padding: 14 }, shadowToken.card]}>
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <b.icon size={20} color={semantic.brandDark} />
              </View>
              <Text variant="label" style={{ fontSize: 12.5 }}>{b.label}</Text>
            </View>
          ))}
        </View>

        <Button label="Verify Now" onPress={() => router.push('/(auth)/identity')} leading={<ShieldCheck size={18} color="#fff" />} />
        <View style={{ alignItems: 'center', marginTop: 14 }}>
          {/* <Text variant="label" color="brand" onPress={() => router.replace('/(app)/groups')}>Do it later</Text> */}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
