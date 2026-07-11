/**
 * app/(app)/[groupId]/more.tsx — the shared Member dashboard's "More" tile.
 * Per spec §0/§3, the member dashboard (and everything on it, including this
 * screen) is IDENTICAL for plain members and for officers viewing their own
 * "Member" tab — a governance action must never appear here, even for an
 * Owner/Treasurer/Auditor. Every one of those governance items already has a
 * real entry point on the officer's own governance dashboard (see
 * OwnerDashboard's quick actions / stat tiles), so this screen renders
 * MEMBER_ITEMS unconditionally regardless of the caller's role.
 */
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Users, ScrollText, Image as ImageIcon, History, Bell, LifeBuoy, UserCircle,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';

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
  const items = MEMBER_ITEMS;

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
