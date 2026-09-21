import { ArrowUpCircle, ArrowUpRight, Coins, Repeat } from 'lucide-react-native';
import { useActiveGroup } from '@/context/GroupContext';
import { GroupSheetNav, type SheetConfig } from './GroupSheetNav';

const MEMBER_ACTIONS: SheetConfig = {
  title: 'What would you like to do?',
  items: [
    { label: 'Submit a contribution', icon: ArrowUpCircle, route: 'contributions/contribute' },
    { label: 'Request a loan', icon: Coins, route: 'loans/request' },
    { label: 'Repay a loan', icon: Repeat, route: 'loans/repay' },
  ],
};

const TREASURER_ACTIONS: SheetConfig = {
  title: 'Record a transaction',
  items: [
    { label: 'Record contribution', icon: ArrowUpRight, route: 'contributions/confirm', params: { tab: 'record' } },
    { label: 'Repayments', icon: Repeat, route: 'loans/record-repayment' },
    { label: 'Confirm disbursement', icon: Coins, route: 'loans/disburse' },
  ],
};

export function GroupNav() {
  const { role } = useActiveGroup();
  if (!role) return null;
  return <GroupSheetNav add={role === 'treasurer' ? TREASURER_ACTIONS : MEMBER_ACTIONS} />;
}
