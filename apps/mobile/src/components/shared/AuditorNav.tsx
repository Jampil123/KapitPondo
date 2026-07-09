/**
 * components/shared/AuditorNav.tsx — auditor bottom nav (config over GroupSheetNav).
 * Postings/proofs review built next ("Soon"); Year-End + Audit Log route real.
 */
import {
  ScrollText, Receipt, Flag, Repeat, CalendarClock, FileText,
  MessageCircle, LifeBuoy, Repeat as Switch,
} from 'lucide-react-native';
import { GroupSheetNav } from './GroupSheetNav';

export function AuditorNav() {
  return (
    <GroupSheetNav
      chat={{ title: 'Group chats', subtitle: 'Messaging isn’t enabled yet', items: [
        { label: 'Officers room', icon: MessageCircle, soon: true },
      ] }}
      add={{ title: 'Review & verify', items: [
        { label: 'Review postings', icon: ScrollText, route: 'audit/postings' },
        { label: 'Review proofs', icon: Receipt, route: 'audit/proofs' },
        { label: 'Flag discrepancy', icon: Flag, soon: true },
        { label: 'Verify reversals', icon: Repeat, soon: true },
      ] }}
      more={{ title: 'More', items: [
        { label: 'Audit log', icon: FileText, route: 'reports/ledger' },
        { label: 'Year-end preview', icon: CalendarClock, route: 'distribution/year-end' },
        { label: 'Switch group', icon: Switch, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
