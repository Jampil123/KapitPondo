/**
 * components/shared/TreasurerNav.tsx — treasurer bottom nav (config over GroupSheetNav).
 * Treasurer record/confirm actions route to sub-screens once built ("Soon" for
 * now); Year-End preview routes to the real distribution screen.
 */
import {
  ArrowUpRight, Repeat, Coins, Minus, SlidersHorizontal, CalendarClock,
  MessageCircle, ScrollText, LifeBuoy, Repeat as Switch,
} from 'lucide-react-native';
import { GroupSheetNav } from './GroupSheetNav';

export function TreasurerNav() {
  return (
    <GroupSheetNav
      chat={{ title: 'Group chats', items: [
        { label: 'Officers room', icon: MessageCircle, route: 'chat/officers' },
      ] }}
      add={{ title: 'Record a transaction', items: [
        { label: 'Record contribution', icon: ArrowUpRight, route: 'contributions/confirm' },
        { label: 'Record repayment', icon: Repeat, route: 'loans/record-repayment' },
        { label: 'Confirm disbursement', icon: Coins, route: 'loans/disburse' },
        { label: 'Record expense', icon: Minus, route: 'expenses/record' },
      ] }}
      more={{ title: 'More', items: [
        { label: 'Ledger', icon: ScrollText, route: 'reports/group-ledger' },
        { label: 'Reversals', icon: SlidersHorizontal, soon: true },
        { label: 'Year-end preview', icon: CalendarClock, route: 'distribution/year-end' },
        { label: 'Switch group', icon: Switch, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
