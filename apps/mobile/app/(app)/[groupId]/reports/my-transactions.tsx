import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { useLedger } from '@/features/reporting/reporting.hooks';
import { LedgerTimeline } from '@/features/activity/LedgerTimeline';
import type { LedgerEntry } from '@/api/ledger';

type Category = 'all' | 'contribution' | 'loan_repayment' | 'loan_disbursement' | 'distribution';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'loan_repayment', label: 'Loan repayments' },
  { key: 'loan_disbursement', label: 'Disbursements' },
];

const OWNER_CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'loan_repayment', label: 'Loan repayments' },
  { key: 'distribution', label: 'Year-end shares' },
];

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}
function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

/** Every ledger entry the officer themselves confirmed or posted — not the
 * full group ledger (see reports/group-ledger.tsx for that), and not "my
 * own contributions" (that's ledger_entries.membership_id, a different
 * field) — this is specifically their own officer activity: what THEY
 * approved and pushed to the ledger. */
export default function MyTransactions() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const { role } = useActiveGroup();
  const isOwner = role === 'owner';
  // The Owner confirms contributions and repayments the Treasurer recorded and
  // finalizes year-end shares, but never releases loans — so the Treasurer's
  // "Disbursements" chip and "Loans disbursed" caption don't apply to them.
  const categories = isOwner ? OWNER_CATEGORIES : CATEGORIES;
  const ledger = useLedger(groupId!, { limit: 500 });
  const [category, setCategory] = useState<Category>('all');

  // posted_by is the final approver (Auditor/Organizer); a Treasurer's own
  // sign-off is the confirmer on the source record, so match either.
  const mine = useMemo(
    () => (member ? (ledger.data ?? []).filter((e) => e.posted_by === member.id || e.confirmer?.id === member.id) : []),
    [ledger.data, member?.id],
  );

  // A single blended sum across every entry type is misleading — a loan
  // disbursement is cash LEAVING the fund (debit) while a contribution or
  // repayment is cash coming IN (credit), so adding them together produces a
  // number that means nothing. Split by direction instead.
  const receivedTotal = useMemo(() => mine.filter((e) => e.direction === 'credit').reduce((s, e) => s + Number(e.amount), 0), [mine]);
  const releasedTotal = useMemo(() => mine.filter((e) => e.direction === 'debit').reduce((s, e) => s + Number(e.amount), 0), [mine]);

  const filtered = useMemo(
    () => (category === 'all' ? mine : mine.filter((e) => e.entry_type === category)),
    [mine, category],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of filtered) {
      const key = monthKey(e.posted_at);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({ label: monthLabel(list[0].posted_at), list }));
  }, [filtered]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Transactions" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16 }}>
          {ledger.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}>
                <Text variant="overline" color="muted">Received</Text>
                <Text style={{ fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: intent.success.text, marginTop: 4 }}>{formatPeso(receivedTotal)}</Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>Contributions + repayments</Text>
              </View>
              <View style={{ flex: 1, paddingLeft: 14, borderLeftWidth: 1, borderColor: semantic.border }}>
                <Text variant="overline" color="muted">{isOwner ? 'Paid out' : 'Released'}</Text>
                <Text style={{ fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 4 }}>{formatPeso(releasedTotal)}</Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>{isOwner ? 'Year-end shares' : 'Loans disbursed'}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ marginTop: 14 }}>
          <PillFilters<Category> options={categories} value={category} onChange={setCategory} />
        </View>

        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : grouped.length === 0 ? (
          <View style={[{ backgroundColor: semantic.card, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 16 }, shadowToken.soft]}>
            <Text variant="body" color="muted">
              {category === 'all' ? "You haven't confirmed any postings yet." : 'Nothing in this category yet.'}
            </Text>
          </View>
        ) : (
          grouped.map((g) => (
            <View key={g.label}>
              <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>{g.label}</Text>
              <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16 }, shadowToken.soft]}>
                <LedgerTimeline
                  entries={g.list}
                  subtitle={(e) => e.membership?.members?.full_name ?? 'Group'}
                  onOpen={(e) => router.push({ pathname: '/(app)/[groupId]/activity/[entryId]' as any, params: { groupId, entryId: e.id, scope: 'group' } })}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
