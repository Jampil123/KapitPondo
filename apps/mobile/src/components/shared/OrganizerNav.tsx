/**
 * components/shared/OrganizerNav.tsx — owner's bottom nav (config over GroupSheetNav).
 * The "+" sheet is the owner's own member actions (officers are members too),
 * same as MemberNav's — admin actions (approve members, loan decisions, group
 * settings) live under "More" instead; cycle, officers and year-end are on the
 * dashboard's manage row.
 */
import {
  ArrowUpCircle, Coins, Repeat, UserCheck, Smartphone,
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
        { label: 'Group settings', icon: Smartphone, route: 'group/settings' },
        { label: 'Approve members', icon: UserCheck, route: 'members/approvals' },
        { label: 'Loan decision', icon: Coins, route: 'loans/decisions' },
        { label: 'Switch group', icon: Repeat, route: '@groups' },
      ] }}
    />
  );
}
