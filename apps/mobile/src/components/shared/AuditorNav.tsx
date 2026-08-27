/**
 * components/shared/AuditorNav.tsx — auditor bottom nav (config over GroupSheetNav).
 * The center action is search (opens the group ledger), not "+" — an Auditor
 * never creates entries, so a create button contradicted the role (see the
 * auditor dashboard reference notes). Member actions still live in the "add"
 * sheet config since officers are members too, but nothing on the bar routes
 * there directly anymore; governance actions (review/verify) live under
 * "More". Postings/proofs review are built; flag/reversals are real now (see
 * AuditorDashboard.tsx's VerificationQueue) — this sheet keeps its own link
 * to the dedicated screens too.
 */
import {
  ArrowUpCircle, Coins, Repeat, ScrollText, Receipt, CalendarClock, FileText,
  MessageCircle, LifeBuoy, Repeat as Switch, Search,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GroupSheetNav } from './GroupSheetNav';

export function AuditorNav() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  return (
    <GroupSheetNav
      centerIcon={Search}
      onCenterPress={() => router.push({ pathname: '/(app)/[groupId]/reports/group-ledger' as any, params: { groupId } })}
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
        { label: 'Verify year-end', icon: CalendarClock, route: 'distribution/year-end' },
        { label: 'Audit log', icon: FileText, route: 'reports/group-ledger' },
        { label: 'Switch group', icon: Switch, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
