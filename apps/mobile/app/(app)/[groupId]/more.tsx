/**
 * app/(app)/[groupId]/more.tsx — reached from DashboardNav's "More" tab.
 * Secondary access point to the owner's existing sub-screens (also reachable
 * from OwnerDashboard's quick actions / stat tiles).
 */
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  SlidersHorizontal, UserCheck, Users, Coins, AlertTriangle, CalendarClock, ChevronRight,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';

const ITEMS = [
  { icon: SlidersHorizontal, label: 'Configure Cycle', key: 'configure-cycle' },
  { icon: UserCheck, label: 'Membership Approvals', key: 'membership-approvals' },
  { icon: Users, label: 'Members & Officers', key: 'members-officers' },
  { icon: Coins, label: 'Loan Decisions', key: 'loan-decisions' },
  { icon: AlertTriangle, label: 'Penalties', key: 'penalties' },
  { icon: CalendarClock, label: 'Year-End', key: 'year-end' },
];

function Row({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
      <Icon size={20} color={semantic.brandDark} />
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      <ChevronRight size={18} color={semantic.textMuted} />
    </Pressable>
  );
}

export default function More() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  function go(key: string) {
    router.push({ pathname: `/(app)/[groupId]/${key}` as any, params: { groupId } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="More" />
      <View style={{ padding: 20 }}>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
          {ITEMS.map((it, i) => (
            <View key={it.key}>
              <Row icon={it.icon} label={it.label} onPress={() => go(it.key)} />
              {i < ITEMS.length - 1 ? (
                <View style={{ height: 1, backgroundColor: semantic.border, marginLeft: 48 }} />
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
