import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoans, useMemberLoanEligibility, useBorrowers } from '@/features/lending/lending.hooks';
import { EligibilityChecklist } from '@/features/lending/EligibilityChecklist';
import { headLabel, type Loan } from '@/api/lending';

const OPEN = ['pending', 'approved', 'active'];
const LIST_CARD = [{ backgroundColor: semantic.card, borderRadius: 16, overflow: 'hidden' as const }, shadowToken.soft];

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function HeadBadge({ n }: { n: number }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>{n}</Text>
    </View>
  );
}

/**
 * Loans hub — request card, my loans (one slot per head), and who in the
 * group is borrowing. A single loan's detail lives in loans/my-loan.tsx.
 */
export default function Loans() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { membership } = useActiveGroup();
  const allLoans = useLoans(groupId!, {});
  const eligibility = useMemberLoanEligibility(groupId!);
  const borrowers = useBorrowers(groupId!);
  const [showPast, setShowPast] = useState(false);

  // listLoans returns the whole group for officers — keep only my own.
  const mine = useMemo(() => (allLoans.data ?? []).filter((l) => l.membership_id === membership?.id), [allLoans.data, membership?.id]);
  const pastLoans = useMemo(() => mine.filter((l) => !OPEN.includes(l.status)), [mine]);
  const openByHead = useMemo(() => new Map(mine.filter((l) => OPEN.includes(l.status)).map((l) => [l.head_no, l])), [mine]);

  const slots = eligibility.data?.slots ?? [];
  const freeCount = slots.filter((s) => !s.loan_id).length;
  const eligible = !!eligibility.data?.eligible;

  const loading = (allLoans.data === null && !allLoans.error) || (eligibility.data === null && !eligibility.error);

  const go = (route: string, extraParams?: Record<string, string>) =>
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId, ...extraParams } });

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
        <BandHeader title="Loans" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Loans" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Request ---------------- */}
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Available in the fund</Text>
            <View style={{ backgroundColor: freeCount > 0 ? intent.success.soft : intent.warning.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
              <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: freeCount > 0 ? intent.success.text : intent.warning.text }}>
                {freeCount} of {slots.length} head{slots.length === 1 ? '' : 's'} free
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.4, marginTop: 4 }}>
            {formatPeso(eligibility.data?.available_cash ?? 0)}
          </Text>
        </View>

        {/* ---------------- Eligibility ---------------- */}
        <View style={{ marginTop: 12 }}>
          <EligibilityChecklist reasons={eligibility.data?.reasons ?? []} />
        </View>

        {/* ---------------- My loans, one row per head ---------------- */}
        <SectionHead title="My loans" aside={slots.length > 1 ? `${slots.length} heads` : undefined} />
        <View>
          {slots.map((slot) => {
            const loan: Loan | undefined = openByHead.get(slot.head_no);
            const label = headLabel(slot.head_no, slot.name);
            if (loan) {
              return (
                <Pressable key={slot.head_no} onPress={() => go('loans/my-loan', { loanId: loan.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: semantic.border }}>
                  <HeadBadge n={slot.head_no} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{label}</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, marginTop: 1 }}>
                      {formatPeso(loan.status === 'active' ? loan.outstanding_balance : loan.approved_principal ?? loan.principal)}
                      {loan.status === 'active' ? <Text variant="caption" color="secondary"> left</Text> : null}
                    </Text>
                  </View>
                  <StatusBadge entity="loan" value={loan.status} />
                  <ChevronRight size={16} color={semantic.textMuted} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={slot.head_no}
                onPress={() => go('loans/request', { head: String(slot.head_no) })}
                disabled={!eligible}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: semantic.border }}
              >
                <HeadBadge n={slot.head_no} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{label}</Text>
                  <Text variant="caption" color="muted" style={{ marginTop: 1 }}>No loan</Text>
                </View>
                {eligible ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Plus size={13} color={semantic.brandDark} />
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>Request</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {pastLoans.length > 0 && (
          <View style={[...LIST_CARD, { marginTop: 12 }]}>
            <Pressable onPress={() => setShowPast((v) => !v)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Past loans ({pastLoans.length})</Text>
              {showPast ? <ChevronUp size={18} color={semantic.textMuted} /> : <ChevronDown size={18} color={semantic.textMuted} />}
            </Pressable>
            {showPast && pastLoans.map((loan) => (
              <View key={loan.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderColor: semantic.border }}>
                <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <Text variant="label" style={{ fontSize: 13.5 }}>{formatPeso(loan.principal)}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>{headLabel(loan.head_no, loan.head_name)}{loan.purpose ? ` · ${loan.purpose}` : ''}</Text>
                </View>
                <StatusBadge entity="loan" value={loan.status} />
              </View>
            ))}
          </View>
        )}

        {/* ---------------- Who's borrowing ---------------- */}
        <SectionHead title="Borrowers" aside={borrowers.data?.length ? `${borrowers.data.length} loan${borrowers.data.length === 1 ? '' : 's'}` : undefined} />
        {borrowers.data === null && !borrowers.error ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 10 }} />
        ) : !borrowers.data?.length ? (
          <Text variant="body" color="muted" style={{ paddingVertical: 8, paddingHorizontal: 2 }}>No one is borrowing right now.</Text>
        ) : (
          <View>
            {borrowers.data.map((b) => (
              <View key={b.loan_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: semantic.border }}>
                <Avatar name={b.full_name ?? 'Member'} uri={b.avatar_url} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{b.full_name ?? 'Member'}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                    {b.heads > 1 ? headLabel(b.head_no, b.head_name, 'Head 1') : '1 head'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(b.amount)}</Text>
                  <StatusBadge entity="loan" value={b.status} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
