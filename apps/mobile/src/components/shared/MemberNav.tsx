/**
 * components/shared/MemberNav.tsx — member's bottom nav (config over GroupSheetNav).
 * Member actions (contribute / loan / repay / ledger) route to member screens
 * once they exist; marked "Soon" until then.
 */
import {
  ArrowUpCircle, Coins, Repeat, ScrollText, FileText, MessageCircle, Users, LifeBuoy, Repeat as Switch,
} from 'lucide-react-native';
import { GroupSheetNav } from './GroupSheetNav';

export function MemberNav() {
  return (
    <GroupSheetNav
      chat={{ title: 'Group chats', subtitle: 'Messaging isn’t enabled yet', items: [
        { label: 'Group feed', icon: MessageCircle, soon: true },
      ] }}
      services={{ title: 'My tools', items: [
        { label: 'My ledger', icon: ScrollText, route: 'ledger' },
        { label: 'My statements', icon: FileText, soon: true },
      ] }}
      add={{ title: 'What would you like to do?', items: [
        { label: 'Submit a contribution', icon: ArrowUpCircle, route: 'contribute' },
        { label: 'Request a loan', icon: Coins, route: 'request-loan' },
        { label: 'Repay a loan', icon: Repeat, route: 'repay' },
      ] }}
      more={{ title: 'More', items: [
        { label: 'Group members', icon: Users, soon: true },
        { label: 'Switch group', icon: Switch, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
