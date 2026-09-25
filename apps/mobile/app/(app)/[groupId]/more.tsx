import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowUpCircle, Coins, Image as ImageIcon, Layers, BarChart3, Users, PiggyBank, Repeat, LifeBuoy,
  UserCheck, Smartphone, ShieldCheck, SlidersHorizontal, AlertTriangle, CalendarClock, ClipboardCheck,
  ChevronRight, Banknote, Flag, Clock, Download, ScrollText, FileText, Stamp, HandCoins, Wallet, Inbox,
  ShieldQuestion, UserCog, LogOut,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { Alert } from '@/lib/alert';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import type { GroupRole } from '@/constants/roles';

type Item = { icon: any; label: string; to: string; replace?: boolean; danger?: boolean };
type Section = { title: string; items: Item[] };

const ROLE_NAME: Record<GroupRole, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

const SIGNOFFS: Item = { icon: Stamp, label: 'Needs your sign-off', to: 'signoffs' };
const YEAR_END: Item = { icon: CalendarClock, label: 'Year-end', to: 'distribution/year-end' };
const LOAN_DECISIONS: Item = { icon: Coins, label: 'Loan decisions', to: 'loans/decisions' };
const PAYMENT_CHANNEL: Item = { icon: Smartphone, label: 'Payment channel', to: 'group/settings' };

// The role's own tools — what this officer comes to the app to do.
const ROLE_TOOLS: Record<GroupRole, Section | null> = {
  owner: {
    title: 'Organizer tools',
    items: [
      SIGNOFFS,
      { icon: UserCheck, label: 'Approve members', to: 'members/approvals' },
      LOAN_DECISIONS,
      { icon: ShieldCheck, label: 'Officers', to: 'members/officers' },
      { icon: SlidersHorizontal, label: 'Cycle settings', to: 'cycles/configure' },
      { icon: AlertTriangle, label: 'Penalties', to: 'penalties' },
      { icon: ClipboardCheck, label: 'Audit findings', to: 'audit/findings' },
      PAYMENT_CHANNEL,
      YEAR_END,
    ],
  },
  treasurer: {
    title: 'Treasurer tools',
    items: [
      { icon: Inbox, label: 'Confirm contributions', to: 'contributions/confirm' },
      { icon: Repeat, label: 'Loan repayments', to: 'loans/record-repayment' },
      { icon: HandCoins, label: 'Release loans', to: 'loans/disburse' },
      SIGNOFFS,
      LOAN_DECISIONS,
      PAYMENT_CHANNEL,
      YEAR_END,
    ],
  },
  auditor: {
    title: 'Audit tools',
    items: [
      { icon: ScrollText, label: 'Ledger and verification', to: 'ledger' },
      { icon: Banknote, label: 'Loan decision audits', to: 'audit/loans' },
      { icon: Flag, label: 'Flags and findings', to: 'audit/flags' },
      { icon: Clock, label: 'Audit trail', to: 'audit/log' },
      { icon: FileText, label: 'Proof review', to: 'audit/proofs' },
      { icon: Download, label: 'Export audit report', to: 'audit/export' },
      { icon: Wallet, label: 'Member balances', to: 'reports/member-balances' },
      YEAR_END,
    ],
  },
  member: null,
};

function sectionsFor(role: GroupRole): Section[] {
  const tools = ROLE_TOOLS[role];
  return [
    ...(tools ? [tools] : []),
    {
      title: 'My records',
      items: [
        { icon: ArrowUpCircle, label: 'Contributions', to: 'contributions' },
        { icon: Coins, label: 'Loans', to: 'loans' },
        { icon: ImageIcon, label: 'Proofs', to: 'proofs' },
        { icon: HandCoins, label: 'Recorded for you', to: 'recorded-for-me' },
        { icon: Layers, label: 'Heads', to: 'heads' },
        { icon: BarChart3, label: 'Reports', to: 'reports' },
      ],
    },
    {
      title: 'Group',
      items: [
        { icon: Users, label: 'Group and officers', to: 'group' },
        { icon: PiggyBank, label: 'Group ledger', to: 'reports/group-ledger' },
        { icon: Repeat, label: 'Switch group', to: '/(app)/groups', replace: true },
      ],
    },
    {
      title: 'About your role',
      items: [
        { icon: ShieldQuestion, label: role === 'member' ? 'What members can do' : `What ${ROLE_NAME[role].toLowerCase()}s can't do`, to: 'role-guide' },
        { icon: UserCog, label: 'Profile and security', to: 'profile' },
        { icon: LifeBuoy, label: 'Help center', to: '/(app)/help-center' },
        { icon: LogOut, label: 'Log out', to: '#logout', danger: true },
      ],
    },
  ];
}

function Row({ item, last, onPress }: { item: Item; last: boolean; onPress: () => void }) {
  const Icon = item.icon;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: item.danger ? semantic.surfaceAlt : intent.info.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={item.danger ? semantic.textSecondary : semantic.brandDark} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{item.label}</Text>
      {item.danger ? null : <ChevronRight size={18} color={semantic.textSecondary} />}
    </Pressable>
  );
}

export default function More() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { member, signOut } = useAuth();
  const { role, group } = useActiveGroup();
  const r = (role ?? 'member') as GroupRole;
  const verified = member?.verification_status === 'verified';

  function go(item: Item) {
    if (item.to === '#logout') {
      Alert.alert('Log out?', 'You can sign back in any time.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => { signOut(); } },
      ]);
      return;
    }
    if (item.to.startsWith('/')) {
      if (item.replace) router.replace(item.to as any);
      else router.push(item.to as any);
      return;
    }
    router.push({ pathname: `/(app)/[groupId]/${item.to}` as any, params: { groupId } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="More" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Who you are here */}
        <Pressable onPress={() => go({ icon: null, label: '', to: 'profile' })} style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, shadowToken.soft]}>
          <Avatar name={member?.full_name ?? 'Member'} uri={member?.avatar_url} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{member?.full_name ?? 'Member'}</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>{ROLE_NAME[r]}{group?.name ? `, ${group.name}` : ''}</Text>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: verified ? intent.success.soft : intent.warning.soft, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 20, marginTop: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: verified ? intent.success.text : intent.warning.text }} />
              <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: verified ? intent.success.text : intent.warning.text }}>{verified ? 'Verified account' : 'Not verified yet'}</Text>
            </View>
          </View>
        </Pressable>

        {sectionsFor(r).map((section) => (
          <View key={section.title}>
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 22, marginBottom: 9 }}>{section.title}</Text>
            <View style={[{ backgroundColor: semantic.card, borderRadius: 20, overflow: 'hidden' }, shadowToken.soft]}>
              {section.items.map((it, i) => <Row key={it.label} item={it} last={i === section.items.length - 1} onPress={() => go(it)} />)}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
