import { ArrowUpCircle, Coins, Repeat } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GroupSheetNav } from './GroupSheetNav';

export function MemberNav() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  return (
    <GroupSheetNav
      onMorePress={() => router.push({ pathname: '/(app)/[groupId]/more' as any, params: { groupId } })}
      onChatPress={() => router.push({ pathname: '/(app)/[groupId]/messages' as any, params: { groupId } })}
      add={{ title: 'What would you like to do?', items: [
        { label: 'Submit a contribution', icon: ArrowUpCircle, route: 'contributions/contribute' },
        { label: 'Request a loan', icon: Coins, route: 'loans/request' },
        { label: 'Repay a loan', icon: Repeat, route: 'loans/repay' },
      ] }}
    />
  );
}
