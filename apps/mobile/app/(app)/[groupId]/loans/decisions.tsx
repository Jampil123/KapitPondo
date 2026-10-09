import { useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Wallet, Banknote, Eye } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { TabBar } from '@/components/ui/TabBar';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoans, useLiquidity } from '@/features/lending/lending.hooks';
import { LoanDecisionSheet, loanName } from '@/features/lending/LoanDecisionSheet';
import type { Loan, LoanStatus } from '@/api/lending';

export default function LoanDecisions() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<LoanStatus>('pending');

  const { membership } = useActiveGroup();
  const liquidity = useLiquidity(groupId!);
  const canDisburse = membership?.role === 'treasurer';
  const pendingList = useLoans(groupId!, { status: 'pending' });
  const tabList = useLoans(groupId!, { status: tab });
  const [detailsTarget, setDetailsTarget] = useState<Loan | null>(null); // loan being viewed before a decision
  const available = Number(liquidity.data?.available_cash ?? 0);

  const list = tabList.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Loan Decisions" />
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        {/* Fund balance */}
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" style={{ opacity: 0.7, color: semantic.textSecondary }}>Available fund balance</Text>
            {liquidity.loading ? <ActivityIndicator /> : <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold' }}>{formatPeso(available)}</Text>}
          </View>
          <Wallet size={26} color={semantic.brandDark} />
        </View>

        <TabBar<LoanStatus>
          options={[{ key: 'pending', label: 'Pending', count: pendingList.data?.length ?? 0 }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }]}
          value={tab}
          onChange={setTab}
        />

        {tabList.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} />
        ) : list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 16 }}>Nothing here</Text>
            <Text variant="body" color="secondary">No {tab} loan requests.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {list.map((l) => (
              <View key={l.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  <Avatar name={loanName(l)} uri={l.membership?.members?.avatar_url} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text variant="label" style={{ fontSize: 14.5 }}>{loanName(l)}</Text>
                      {l.membership?.role === 'owner' ? (
                        <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
                          <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Organizer's request</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="caption" color="secondary">{l.purpose ?? '—'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(l.principal)}</Text>
                    <Text variant="caption" color="secondary">{l.term_months} mo</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StatusBadge entity="loan" value={l.status} />
                  <Pressable
                    onPress={() => setDetailsTarget(l)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: semantic.border }}
                  >
                    <Eye size={13} color={semantic.textSecondary} />
                    <Text variant="caption" style={{ color: semantic.textSecondary, fontFamily: 'Poppins_500Medium' }}>View details</Text>
                  </Pressable>
                </View>
                {l.status === 'approved' ? (
                  <View style={{ gap: 10, marginTop: 12 }}>
                    <Text variant="caption" color="secondary">
                      Approved{l.approved_principal && Number(l.approved_principal) !== Number(l.principal) ? ` for ${formatPeso(l.approved_principal)} (partial)` : ''} — awaiting disbursement
                    </Text>
                    {canDisburse ? (
                      <Pressable
                        onPress={() => router.push({ pathname: '/(app)/[groupId]/loans/disburse' as any, params: { groupId } })}
                        style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#E2F0E8', borderRadius: 12, paddingVertical: 11 }}
                      >
                        <Banknote size={16} color="#3E8E66" strokeWidth={2.4} />
                        <Text variant="label" style={{ color: '#3E8E66', fontSize: 13.5 }}>Go to disbursement</Text>
                      </Pressable>
                    ) : (
                      // The Owner decides (approves); the Treasurer releases the
                      // cash — keeping disbursement off the Owner's own screen.
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 11, justifyContent: 'center' }}>
                        <Banknote size={16} color={semantic.textMuted} strokeWidth={2.4} />
                        <Text variant="label" style={{ color: semantic.textMuted, fontSize: 13.5 }}>Waiting on the Treasurer</Text>
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <LoanDecisionSheet
        groupId={groupId!}
        loan={detailsTarget}
        onClose={() => setDetailsTarget(null)}
        onDecided={() => { pendingList.refetch(); tabList.refetch(); liquidity.refetch(); }}
      />
    </SafeAreaView>
  );
}
