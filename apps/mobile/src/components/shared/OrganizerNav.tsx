/**
 * components/shared/OrganizerNav.tsx — owner's bottom nav (config over GroupSheetNav).
 * The "+" sheet is the owner's own member actions (officers are members too),
 * same as MemberNav's — admin actions (configure cycle, approve members, loan
 * decisions, record expense) live under "More" instead.
 */
import {
  ArrowUpCircle, Coins, Repeat, SlidersHorizontal, UserCheck, Receipt, Users, CalendarClock,
  LifeBuoy, Smartphone,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GroupSheetNav } from './GroupSheetNav';

export function OrganizerNav() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  return (
    <GroupSheetNav
      onChatPress={() => router.push({ pathname: '/(app)/[groupId]/messages' as any, params: { groupId } })}
      add={{ title: 'What would you like to do?', items: [
        { label: 'Submit a contribution', icon: ArrowUpCircle, route: 'contributions/contribute' },
        { label: 'Request a loan', icon: Coins, route: 'loans/request' },
        { label: 'Repay a loan', icon: Repeat, route: 'loans/repay' },
      ] }}
      more={{ title: 'More', subtitle: 'Manage & account', items: [
        { label: 'Configure cycle', icon: SlidersHorizontal, route: 'cycles/configure' },
        { label: 'Approve members', icon: UserCheck, route: 'members/approvals' },
        { label: 'Loan decision', icon: Coins, route: 'loans/decisions' },
        { label: 'Record expense', icon: Receipt, soon: true },
        { label: 'Manage officers', icon: Users, route: 'members/officers' },
        { label: 'Group settings', icon: Smartphone, route: 'group/settings' },
        { label: 'Year-end distribution', icon: CalendarClock, route: 'distribution/year-end' },
        { label: 'Switch group', icon: Repeat, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
