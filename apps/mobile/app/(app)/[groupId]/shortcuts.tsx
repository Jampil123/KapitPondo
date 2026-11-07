import { View, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowUpCircle, Coins, Image as ImageIcon, Layers, BarChart3, Users, PiggyBank,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
import { semantic, shadowToken } from '@/theme/colors';

type Tile = { icon: any; label: string; to: string };

// One grid, most-used first: money in/out, then records, then the group.
const TILES: Tile[] = [
  { icon: ArrowUpCircle, label: 'Contributions', to: 'contributions' },
  { icon: Coins, label: 'Loans', to: 'loans' },
  { icon: BarChart3, label: 'My Ledger', to: 'reports' },
  { icon: PiggyBank, label: 'Group Ledger', to: 'reports/group-ledger' },
  { icon: ImageIcon, label: 'Proofs', to: 'proofs' },
  { icon: Layers, label: 'Heads', to: 'heads' },
  { icon: Users, label: 'Group & Officers', to: 'group' },
];

const COLUMNS = 4;
const GAP = 8;
const PADDING = 16;

export default function Shortcuts() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { width } = useWindowDimensions();
  // Floored: a fractional width can add up to a hair over the row and wrap the 4th tile.
  const tileWidth = Math.floor((width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Shortcuts" />
      <ScrollView contentContainerStyle={{ padding: PADDING, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 18, marginTop: 4 }}>
          {TILES.map((t) => (
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
      </ScrollView>
    </SafeAreaView>
  );
}
