/**
 * app/(app)/[groupId]/more.tsx — the dashboard grid's "More" tile.
 * Owner content is the original designer layout (also reachable from
 * OwnerDashboard's quick actions). Member content is the overflow menu from
 * MemberDashboard's "More" tile — this file was previously unreferenced by
 * any nav for any role, so branching by role here (instead of adding a
 * colliding more/index.tsx) reuses it rather than duplicating the shell.
 */
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  SlidersHorizontal, UserCheck, Users, Coins, AlertTriangle, CalendarClock,
  ScrollText, Image as ImageIcon, History, Bell, LifeBuoy, UserCircle,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';

const OWNER_ITEMS = [
  { icon: SlidersHorizontal, label: 'Configure Cycle', key: 'cycles/configure', section: 'Cycle & money' },
  { icon: Coins, label: 'Loan Decisions', key: 'loans/decisions', section: 'Cycle & money' },
  { icon: AlertTriangle, label: 'Penalties', key: 'penalties', section: 'Cycle & money' },
  { icon: CalendarClock, label: 'Year-End', key: 'distribution/year-end', section: 'Cycle & money' },
  { icon: UserCheck, label: 'Membership Approvals', key: 'members/approvals', section: 'Members' },
  { icon: Users, label: 'Members & Officers', key: 'members/officers', section: 'Members' },
];

const MEMBER_ITEMS = [
  { icon: ScrollText, label: 'My Ledger & Reports', key: 'reports/ledger', section: 'My records' },
  { icon: ImageIcon, label: 'My Proofs', key: 'proofs', section: 'My records' },
  { icon: History, label: 'Approvals Trail', key: 'activity', section: 'My records' },
  { icon: Users, label: 'Group & Officers', key: 'group', section: 'Group' },
  { icon: UserCircle, label: 'Profile & Settings', key: 'profile', section: 'Group' },
  { icon: Bell, label: 'Notifications', key: 'notifications', section: 'Support', soon: true },
  { icon: LifeBuoy, label: 'Help', key: 'help', section: 'Support', soon: true },
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sectionsOf<T extends { section: string }>(items: T[]): { section: string; items: T[] }[] {
  const order: string[] = [];
  const bySection = new Map<string, T[]>();
  for (const it of items) {
    if (!bySection.has(it.section)) { bySection.set(it.section, []); order.push(it.section); }
    bySection.get(it.section)!.push(it);
  }
  return order.map((section) => ({ section, items: bySection.get(section)! }));
}

function Tile({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 72, alignItems: 'center', gap: 6 }}>
      <View style={[{ width: 54, height: 54, borderRadius: 16, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }, shadowToken.card]}>
        <Icon size={22} color={semantic.brandDark} />
      </View>
      <Text variant="caption" style={{ textAlign: 'center', fontSize: 10.5, lineHeight: 13 }} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export default function More() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { role } = useActiveGroup();
  const items = role === 'member' ? MEMBER_ITEMS : OWNER_ITEMS;

  function go(item: (typeof items)[number]) {
    if ('soon' in item && item.soon) return void Alert.alert(item.label, 'Coming soon.');
    router.push({ pathname: `/(app)/[groupId]/${item.key}` as any, params: { groupId } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="More" />
      <View style={{ padding: 20, gap: 22 }}>
        {sectionsOf(items).map(({ section, items: sectionItems }) => (
          <View key={section} style={{ gap: 12 }}>
            <Text variant="h3" style={{ fontSize: 14 }}>{section}</Text>
            <View style={{ gap: 14 }}>
              {chunk(sectionItems, 4).map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: 16 }}>
                  {row.map((it) => (
                    <Tile key={it.key} icon={it.icon} label={it.label} onPress={() => go(it)} />
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}
