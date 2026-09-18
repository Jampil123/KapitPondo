import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Info, ScrollText, MessageCircle, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';

const BAND_TOP = '#4C7C90';

const HOW_IT_WORKS = [
  'Your group sets up a cycle — how often to contribute, how much per head, and any late penalty.',
  'You contribute and attach proof (receipt, transfer, or e-wallet screenshot).',
  'A Treasurer records it; an Auditor — never the same person — reviews and approves it.',
  'Every approved posting becomes part of an append-only ledger your group can always look back on.',
];

function LinkRow({ icon: Icon, label, onPress, divider }: { icon: any; label: string; onPress: () => void; divider?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14,
        borderTopWidth: divider ? 1 : 0, borderTopColor: semantic.border,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={semantic.brandDark} />
      </View>
      <Text variant="label" style={{ fontSize: 13.5, flex: 1 }}>{label}</Text>
      <ChevronRight size={18} color={semantic.textMuted} />
    </Pressable>
  );
}

export default function About() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="About KapitPondo" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <View style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Info size={28} color={semantic.brandDark} />
          </View>
          <Text variant="h1" style={{ fontSize: 20, marginBottom: 4 }}>KapitPondo</Text>
          <Text variant="caption" color="muted">Version {Constants.expoConfig?.version ?? '—'}</Text>
        </View>

        <Text variant="body" color="secondary" style={{ lineHeight: 21, marginBottom: 22 }}>
          KapitPondo is a digital paluwagan / cooperative fund manager. It records and verifies money that
          moves outside the app — cash, bank, or e-wallet transfers — but never holds or moves funds itself.
          Every financial event is a claim that must be backed by proof and explicitly approved, and every
          posting is append-only with a full audit trail.
        </Text>

        <Text variant="overline" color="muted" style={{ marginBottom: 9 }}>How it works</Text>
        <View style={{ marginBottom: 22, gap: 12 }}>
          {HOW_IT_WORKS.map((line, i) => (
            <View key={line} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark, width: 16 }}>{i + 1}</Text>
              <Text variant="body" color="secondary" style={{ flex: 1, lineHeight: 20 }}>{line}</Text>
            </View>
          ))}
        </View>

        <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>More</Text>
        <LinkRow icon={ScrollText} label="Privacy Policy" onPress={() => router.push('/(app)/privacy-policy' as any)} />
        <LinkRow icon={MessageCircle} label="Send feedback" divider onPress={() => router.push('/(app)/send-feedback' as any)} />
      </ScrollView>
    </SafeAreaView>
  );
}
