/**
 * components/shared/AuditorNav.tsx — auditor bottom nav (config over GroupSheetNav).
 * The "+" sheet is the auditor's own member actions (officers are members too,
 * same as every other role's nav) — governance actions (review/verify) live
 * under "More" instead. Postings/proofs review are built; flag/reversals are
 * "Soon" until the backend exists.
 */
import {
  ArrowUpCircle, Coins, Repeat, ScrollText, Receipt, Flag, CalendarClock, FileText,
  MessageCircle, LifeBuoy, Repeat as Switch,
} from 'lucide-react-native';
import { GroupSheetNav } from './GroupSheetNav';

export function AuditorNav() {
  return (
    <GroupSheetNav
      chat={{ title: 'Group chats', items: [
        { label: 'Officers room', icon: MessageCircle, route: 'chat/officers' },
      ] }}
      add={{ title: 'What would you like to do?', items: [
        { label: 'Submit a contribution', icon: ArrowUpCircle, route: 'contributions/contribute' },
        { label: 'Request a loan', icon: Coins, route: 'loans/request' },
        { label: 'Repay a loan', icon: Repeat, route: 'loans/repay' },
      ] }}
      more={{ title: 'Review & verify', items: [
        { label: 'Review postings', icon: ScrollText, route: 'audit/postings' },
        { label: 'Review proofs', icon: Receipt, route: 'audit/proofs' },
        { label: 'Flag discrepancies', icon: Flag, soon: true },
        { label: 'Verify reversals', icon: Repeat, soon: true },
        { label: 'Verify year-end', icon: CalendarClock, route: 'distribution/year-end' },
        { label: 'Audit log', icon: FileText, route: 'reports/group-ledger' },
        { label: 'Switch group', icon: Switch, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
