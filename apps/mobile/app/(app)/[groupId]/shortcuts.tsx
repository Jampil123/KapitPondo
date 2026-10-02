import { View, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowUpCircle, Coins, Image as ImageIcon, Layers, BarChart3, Users, PiggyBank, HandCoins, History,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
import { semantic, shadowToken } from '@/theme/colors';

type Tile = { icon: any; label: string; to: string };
type Section = { title: string; tiles: Tile[] };

const SECTIONS: Section[] = [
  {
    title: 'My records',
    tiles: [
      { icon: ArrowUpCircle, label: 'Contributions', to: 'contributions' },
      { icon: Coins, label: 'Loans', to: 'loans' },
      { icon: BarChart3, label: 'My Ledger', to: 'reports' },
      { icon: History, label: 'Activity', to: 'activity' },
      { icon: ImageIcon, label: 'Proofs', to: 'proofs' },
      { icon: HandCoins, label: 'Recorded for you', to: 'recorded-for-me' },
      { icon: Layers, label: 'Heads', to: 'heads' },
    ],
  },
  {
    title: 'Group',
    tiles: [
      { icon: Users, label: 'Group & Officers', to: 'group' },
      { icon: PiggyBank, label: 'Group ledger', to: 'reports/group-ledger' },
    ],
  },
];

const COLUMNS = 4;
const GAP = 8;
const PADDING = 16;

export default function Shortcuts() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { width } = useWindowDimensions();
  const tileWidth = (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Shortcuts" />
      <ScrollView contentContainerStyle={{ padding: PADDING, paddingBottom: 32 }}>
        {SECTIONS.map((section, si) => (
          <View key={section.title}>
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: si === 0 ? 4 : 22, marginBottom: 10 }}>
              {section.title}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 16 }}>
              {section.tiles.map((t) => (
                <Pressable
                  key={t.label}
                  onPress={() => router.push({ pathname: `/(app)/[groupId]/${t.to}` as any, params: { groupId } })}
                  style={{ width: tileWidth, alignItems: 'center', gap: 7 }}
                >
                  <View style={[{ width: 58, height: 58, borderRadius: 18, backgroundColor: semantic.card, alignItems: 'center', justifyContent: 'center' }, shadowToken.soft]}>
                    <t.icon size={26} color={NAV_BG} strokeWidth={1.8} />
                  </View>
                  <Text variant="caption" style={{ textAlign: 'center', fontSize: 11, lineHeight: 14, color: semantic.textPrimary }} numberOfLines={2}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
