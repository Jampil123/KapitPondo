/**
 * features/dashboard/StaticMemberView.tsx
 * ----------------------------------------------------------------------------
 * Static visual clone of MemberDashboard.tsx, shown when an officer (owner or
 * treasurer) flips their Officer/Member switch bar (wired in
 * app/(app)/[groupId]/index.tsx) to "Member" — officers are members too, but
 * this view isn't wired to real data yet: every tile just alerts "Coming soon."
 * `groupId` is accepted (unused) so this has the same shape as the other
 * dashboard components, ready to wire up later.
 */
import { Alert, View, Pressable } from 'react-native';
import {
  ArrowUpCircle, Coins, PiggyBank, BadgeCheck, Users, History, BarChart3, MoreHorizontal,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';

function SectionTitle({ title }: { title: string }) {
  return <Text variant="h3" style={{ fontSize: 15 }}>{title}</Text>;
}

function StaticHero() {
  return (
    <View style={{ borderRadius: 20, padding: 18, backgroundColor: semantic.brand, shadowColor: semantic.brand, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 6, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 3 }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Your contributions · this cycle</Text>
          <Text style={{ fontSize: 30, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: -0.5 }}>₱0.00</Text>
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999 }}>
          <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>No cycle</Text>
        </View>
      </View>

      <View style={{ gap: 7, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.9 }}>0 contributions approved</Text>
          <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>0%</Text>
        </View>
        <View style={{ height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
          <View style={{ width: '0%', height: '100%', backgroundColor: '#fff', borderRadius: 999 }} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 11, gap: 2 }}>
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.75 }}>Group fund</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>₱0.00</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 11, gap: 2 }}>
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.75 }}>Next due</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>—</Text>
        </View>
      </View>
    </View>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const ACTIONS: { label: string; icon: any }[] = [
  { label: 'Contributions', icon: ArrowUpCircle },
  { label: 'Loans', icon: Coins },
  { label: 'Fund', icon: PiggyBank },
  { label: 'My Standing', icon: BadgeCheck },
  { label: 'Group & Officers', icon: Users },
  { label: 'Activity', icon: History },
  { label: 'Reports', icon: BarChart3 },
  { label: 'More', icon: MoreHorizontal },
];

export function StaticMemberView({ groupId: _groupId }: { groupId: string }) {
  return (
    <>
      <StaticHero />

      <SectionTitle title="Quick actions" />
      <View style={{ gap: 14 }}>
        {chunk(ACTIONS, 4).map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {row.map((a) => (
              <Pressable key={a.label} onPress={() => Alert.alert(a.label, 'Coming soon.')} style={{ width: '22%', alignItems: 'center', gap: 6 }}>
                <View style={[{ width: 54, height: 54, borderRadius: 16, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }, shadowToken.card]}>
                  <a.icon size={22} color={semantic.brandDark} strokeWidth={1.8} />
                </View>
                <Text variant="caption" style={{ textAlign: 'center', fontSize: 10.5, lineHeight: 13 }} numberOfLines={2}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <SectionTitle title="My activity" />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
        <Text variant="body" color="muted">No recent activity yet.</Text>
      </View>
    </>
  );
}
