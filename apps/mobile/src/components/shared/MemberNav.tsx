/**
 * components/shared/MemberNav.tsx — member's bottom nav (config over GroupSheetNav).
 * Member actions (contribute / loan / repay / ledger) route to member screens
 * once they exist; marked "Soon" until then.
 */
import {
  ArrowUpCircle, Coins, Repeat, MessageCircle, Users, LifeBuoy, Repeat as Switch,
} from 'lucide-react-native';
import { GroupSheetNav } from './GroupSheetNav';

export function MemberNav() {
  return (
    <GroupSheetNav
      chat={{ title: 'Group chats', subtitle: 'Messaging isn’t enabled yet', items: [
        { label: 'Group feed', icon: MessageCircle, soon: true },
      ] }}
      add={{ title: 'What would you like to do?', items: [
        { label: 'Submit a contribution', icon: ArrowUpCircle, route: 'contributions/contribute' },
        { label: 'Request a loan', icon: Coins, route: 'loans/request' },
        { label: 'Repay a loan', icon: Repeat, route: 'loans/repay' },
      ] }}
      more={{ title: 'More', items: [
        { label: 'Group & officers', icon: Users, route: 'group' },
        { label: 'Switch group', icon: Switch, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
