/**
 * components/shared/OrganizerNav.tsx — owner's bottom nav (config over GroupSheetNav).
 */
import {
  SlidersHorizontal, UserCheck, Coins, Receipt, Users, Repeat, CalendarClock,
  ArrowUpCircle, FileText, LifeBuoy, MessageCircle,
} from 'lucide-react-native';
import { GroupSheetNav } from './GroupSheetNav';

export function OrganizerNav() {
  return (
    <GroupSheetNav
      chat={{ title: 'Group chats', subtitle: 'Messaging isn’t enabled yet', items: [
        { label: 'Officers room', icon: Users, soon: true },
        { label: 'Group feed', icon: MessageCircle, soon: true },
      ] }}
      services={{ title: 'Member tools', subtitle: 'Officers are members too', items: [
        { label: 'Make a contribution', icon: ArrowUpCircle, soon: true },
        { label: 'Request a loan', icon: Coins, soon: true },
        { label: 'My repayments', icon: Repeat, soon: true },
        { label: 'My statements', icon: FileText, soon: true },
      ] }}
      add={{ title: 'Create new', items: [
        { label: 'Configure cycle', icon: SlidersHorizontal, route: 'configure-cycle' },
        { label: 'Approve members', icon: UserCheck, route: 'membership-approvals' },
        { label: 'Loan decision', icon: Coins, route: 'loan-decisions' },
        { label: 'Record expense', icon: Receipt, soon: true },
      ] }}
      more={{ title: 'More', subtitle: 'Manage & account', items: [
        { label: 'Group settings', icon: SlidersHorizontal, route: 'configure-cycle' },
        { label: 'Manage officers', icon: Users, route: 'members-officers' },
        { label: 'Year-end distribution', icon: CalendarClock, route: 'year-end' },
        { label: 'Switch group', icon: Repeat, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
