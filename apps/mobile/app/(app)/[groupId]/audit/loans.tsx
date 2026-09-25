import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banknote } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLoanAudits } from '@/features/loanAudits/loanAudits.hooks';
import { ChecksPill } from '@/features/loanAudits/ChecksPill';
import type { LoanAudit } from '@/api/loanAudits';

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function Row({ a, last, onPress }: { a: LoanAudit; last: boolean; onPress: () => void }) {
  const bad = a.failed > 0;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bad ? intent.danger.soft : intent.info.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Banknote size={18} color={bad ? intent.danger.text : semantic.brandDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{a.borrower ?? 'Member'}</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary, marginBottom: 6 }}>
          {a.ref}, {a.partial ? 'partially approved' : 'approved'} on {shortDate(a.approved_at)}
        </Text>
        <ChecksPill failed={a.failed} />
      </View>
      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(a.approved_principal ?? a.principal)}</Text>
    </Pressable>
  );
}

export default function LoanDecisionAudits() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const audits = useLoanAudits(groupId!);
  const list = audits.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Loan decision audits" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text variant="caption" color="secondary" style={{ lineHeight: 17, paddingHorizontal: 2 }}>
          Check that each approved loan followed the group’s rules. You can review decisions but not change them.
        </Text>
        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, marginTop: 12, overflow: 'hidden' }, shadowToken.soft]}>
          {audits.loading && list.length === 0 ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 24 }} />
          ) : list.length === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>No loans have been approved yet.</Text>
          ) : list.map((a, i) => (
            <Row
              key={a.loan_id}
              a={a}
              last={i === list.length - 1}
              onPress={() => router.push({ pathname: '/(app)/[groupId]/audit/loan/[id]' as any, params: { groupId, id: a.loan_id } })}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
