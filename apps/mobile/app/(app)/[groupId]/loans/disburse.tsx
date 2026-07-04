/**
 * app/(app)/[groupId]/loans/disburse.tsx — treasurer disbursement view (M6).
 *
 * HONEST NOTE: the design has a separate "confirm disbursement" step, but our
 * API fuses approval + disbursement into one call (approve_and_disburse_loan),
 * done from the Loan Decision screen. So loans don't sit in an "approved,
 * awaiting release" state — there's normally nothing here. If the backend later
 * splits authorization from disbursement (per spec §1.2), this screen lists
 * 'approved' loans and posts the disbursement.
 */
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Coins } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLoans } from '@/features/lending/lending.hooks';

function nameOf(l: any) { return l.borrower_name ?? l.member_name ?? l.members?.full_name ?? 'Member'; }

export default function Disburse() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const loans = useLoans(groupId!, { status: 'approved' });
  const list = loans.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Disbursement" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#F8EFDA', borderRadius: 12, padding: 12 }}>
          <AlertTriangle size={18} color="#A87C2C" />
          <Text variant="caption" style={{ color: '#A87C2C', flex: 1 }}>
            In this build, approval and disbursement happen together in the organizer’s Loan Decision, so there’s usually nothing to release here.
          </Text>
        </View>

        {loans.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} /> :
        list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 44, gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Coins size={26} color={semantic.textMuted} />
            </View>
            <Text variant="h3" style={{ fontSize: 16 }}>Nothing to release</Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>All approved loans are already disbursed.</Text>
          </View>
        ) : list.map((l) => (
          <View key={l.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }, shadowToken.card]}>
            <Avatar name={nameOf(l)} size={44} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="label" style={{ fontSize: 14.5 }}>{nameOf(l)}</Text>
              <StatusBadge entity="loan" value={l.status} />
            </View>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(l.principal)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
