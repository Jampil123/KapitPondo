import { ArrowUpCircle, Coins, Repeat } from 'lucide-react-native';
import { useActiveGroup } from '@/context/GroupContext';
import { GroupSheetNav, type SheetConfig } from './GroupSheetNav';

// The + button is for everyday member actions, whatever the role — an
// officer's recording tools live on the More page.
const MEMBER_ACTIONS: SheetConfig = {
  title: 'Quick actions',
  items: [
    { label: 'Request a loan', icon: Coins, route: 'loans/request' },
    { label: 'Submit contribution', icon: ArrowUpCircle, route: 'contributions/contribute' },
    { label: 'Loan repayment', icon: Repeat, route: 'loans/repay' },
  ],
};

export function GroupNav() {
  const { role } = useActiveGroup();
  if (!role) return null;
  return <GroupSheetNav add={MEMBER_ACTIONS} />;
}
