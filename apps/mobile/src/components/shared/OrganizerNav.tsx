/**
 * components/shared/OrganizerNav.tsx — owner's bottom nav (config over GroupSheetNav).
 */
import {
  SlidersHorizontal, UserCheck, Coins, Receipt, Users, Repeat, CalendarClock,
  LifeBuoy, MessageCircle,
} from 'lucide-react-native';
import { GroupSheetNav } from './GroupSheetNav';

export function OrganizerNav() {
  return (
    <GroupSheetNav
      chat={{ title: 'Group chats', subtitle: 'Messaging isn’t enabled yet', items: [
        { label: 'Officers room', icon: Users, soon: true },
        { label: 'Group feed', icon: MessageCircle, soon: true },
      ] }}
      add={{ title: 'Create new', items: [
        { label: 'Configure cycle', icon: SlidersHorizontal, route: 'cycles/configure' },
        { label: 'Approve members', icon: UserCheck, route: 'members/approvals' },
        { label: 'Loan decision', icon: Coins, route: 'loans/decisions' },
        { label: 'Record expense', icon: Receipt, soon: true },
      ] }}
      more={{ title: 'More', subtitle: 'Manage & account', items: [
        { label: 'Group settings', icon: SlidersHorizontal, route: 'cycles/configure' },
        { label: 'Manage officers', icon: Users, route: 'members/officers' },
        { label: 'Year-end distribution', icon: CalendarClock, route: 'distribution/year-end' },
        { label: 'Switch group', icon: Repeat, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
