import {
  ArrowUpRight, Repeat, Coins, Minus, SlidersHorizontal, CalendarClock,
  ScrollText, LifeBuoy, Repeat as Switch, Smartphone,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GroupSheetNav } from './GroupSheetNav';

export function TreasurerNav() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  return (
    <GroupSheetNav
      onChatPress={() => router.push({ pathname: '/(app)/[groupId]/messages' as any, params: { groupId } })}
      add={{ title: 'Record a transaction', items: [
        { label: 'Record contribution', icon: ArrowUpRight, route: 'contributions/confirm' },
        { label: 'Repayments', icon: Repeat, route: 'loans/record-repayment' },
        { label: 'Confirm disbursement', icon: Coins, route: 'loans/disburse' },
        { label: 'Record expense', icon: Minus, route: 'expenses/record' },
      ] }}
      more={{ title: 'More', items: [
        { label: 'Ledger', icon: ScrollText, route: 'reports/group-ledger' },
        { label: 'Group settings', icon: Smartphone, route: 'group/settings' },
        { label: 'Reversals', icon: SlidersHorizontal, soon: true },
        { label: 'Year-end preview', icon: CalendarClock, route: 'distribution/year-end' },
        { label: 'Switch group', icon: Switch, route: '@groups' },
        { label: 'Help & support', icon: LifeBuoy, soon: true },
      ] }}
    />
  );
}
