import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowUpCircle, Coins, Image as ImageIcon, Layers, BarChart3, Users, PiggyBank, Repeat, LifeBuoy,
  UserCheck, Smartphone, ShieldCheck, SlidersHorizontal, AlertTriangle, CalendarClock, ScrollText, FileText, Wallet,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import type { GroupRole } from '@/constants/roles';

type Item = { icon: any; label: string; to: string; replace?: boolean };
type Section = { title: string; items: Item[] };

const YEAR_END: Item = { icon: CalendarClock, label: 'Year-end', to: 'distribution/year-end' };
const LOAN_DECISIONS: Item = { icon: Coins, label: 'Loan decisions', to: 'loans/decisions' };
const PAYMENT_CHANNEL: Item = { icon: Smartphone, label: 'Payment channel', to: 'group/settings' };

const MANAGE: Record<GroupRole, Item[]> = {
  owner: [
    { icon: UserCheck, label: 'Approve members', to: 'members/approvals' },
    LOAN_DECISIONS,
    PAYMENT_CHANNEL,
    { icon: ShieldCheck, label: 'Officers', to: 'members/officers' },
    { icon: SlidersHorizontal, label: 'Cycle settings', to: 'cycles/configure' },
    { icon: AlertTriangle, label: 'Penalties', to: 'penalties' },
    YEAR_END,
  ],
  treasurer: [LOAN_DECISIONS, PAYMENT_CHANNEL, YEAR_END],
  auditor: [
    { icon: ScrollText, label: 'Audit log', to: 'audit/log' },
    { icon: FileText, label: 'Proof review', to: 'audit/proofs' },
    { icon: Wallet, label: 'Member balances', to: 'reports/member-balances' },
    YEAR_END,
  ],
  member: [],
};

function sectionsFor(role: GroupRole): Section[] {
  const manage = MANAGE[role];
  return [
    {
      title: 'My records',
      items: [
        { icon: ArrowUpCircle, label: 'Contributions', to: 'contributions' },
        { icon: Coins, label: 'Loans', to: 'loans' },
        { icon: ImageIcon, label: 'Proofs', to: 'proofs' },
        { icon: Layers, label: 'Heads', to: 'heads' },
        { icon: BarChart3, label: 'Reports', to: 'reports' },
      ],
    },
    {
      title: 'Group',
      items: [
        { icon: Users, label: 'Group & officers', to: 'group' },
        { icon: PiggyBank, label: 'Group ledger', to: 'reports/group-ledger' },
        { icon: Repeat, label: 'Switch group', to: '/(app)/groups', replace: true },
      ],
    },
    ...(manage.length ? [{ title: 'Manage', items: manage }] : []),
    { title: 'Help', items: [{ icon: LifeBuoy, label: 'Help center', to: '/(app)/help-center' }] },
  ];
}

function Tile({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: '25%', alignItems: 'center', gap: 6, paddingVertical: 7 }}>
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

  function go(item: Item) {
    if (item.to.startsWith('/')) {
      if (item.replace) router.replace(item.to as any);
      else router.push(item.to as any);
      return;
    }
    router.push({ pathname: `/(app)/[groupId]/${item.to}` as any, params: { groupId } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="More" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 18 }}>
        {sectionsFor(role ?? 'member').map((section) => (
          <View key={section.title} style={{ gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 14 }}>{section.title}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {section.items.map((it) => (
                <Tile key={it.label} icon={it.icon} label={it.label} onPress={() => go(it)} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
