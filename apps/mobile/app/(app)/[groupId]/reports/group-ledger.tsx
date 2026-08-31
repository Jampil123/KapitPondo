/**
 * app/(app)/[groupId]/reports/group-ledger.tsx — "Fund ledger" (member).
 * Rebuilt from an officer-oriented screen into a real member-facing feature:
 * the group's WHOLE ledger, not just the caller's own entries — a genuine
 * transparency policy (confirmed explicitly, not assumed), backed by a new
 * member-safe route (GET /reports/fund-ledger) that deliberately doesn't
 * self-scope, unlike every other member-facing ledger call in this app.
 *
 * Two adaptations from the design it's built from, both because the data
 * doesn't exist to back the literal copy:
 *   - No separate "recorded by X, verified by Y" — a ledger row only carries
 *     ONE officer (posted_by, "always the approving officer" per the posting
 *     RPCs). Who originally recorded the claim isn't on the ledger row
 *     itself. Shown as "confirmed by {officer}" instead of inventing a
 *     second name.
 *   - No "Interest earned" line in the composition — loan repayments post as
 *     ONE combined ledger credit (principal + interest together, see
 *     record_loan_repayment()'s single insert), so interest isn't separately
 *     summable from the ledger. The composition is derived by summing the
 *     entries actually fetched (grouped by entry_type), not group_summary()
 *     — that RPC only breaks out 5 of 9 entry_types (nothing for penalty/
 *     adjustment/reversal/fee), which would make the rows visibly not add
 *     up to their own total for a group with any of those postings.
 *   - The transparency banner doesn't claim proof images are private to
 *     "the sender and the officers" — the proofs bucket's RLS (migration
 *     0012) allows any authenticated app user to read a file if they have
 *     its exact path. This ledger doesn't expose paths (only source_id), so
 *     said plainly instead of promising a boundary the storage layer
 *     doesn't enforce.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, ArrowDownRight, Receipt, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useFundSummary, useFundLedger } from '@/features/reporting/reporting.hooks';
import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type Filter = 'all' | 'in' | 'out' | 'mine';

const TYPE_LABEL: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan released',
  loan_repayment: 'Loan repayment',
  distribution: 'Year-end share',
  expense: 'Expense',
  penalty: 'Late penalty',
  fee: 'Fee',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
};

const COMPOSITION_LABEL: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Contributions received',
  loan_repayment: 'Loan repayments received',
  penalty: 'Penalties received',
  distribution: 'Year-end shares paid',
  loan_disbursement: 'Loans released',
  expense: 'Expenses paid',
};

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}
function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function iconTone(e: LedgerEntry): { bg: string; fg: string; Icon: any } {
  if (e.entry_type === 'expense') return { bg: intent.warning.soft, fg: intent.warning.text, Icon: Receipt };
  if (e.direction === 'credit') return { bg: intent.success.soft, fg: intent.success.text, Icon: ArrowDownRight };
  return { bg: semantic.surfaceAlt, fg: semantic.brandDark, Icon: ArrowUpRight };
}

function Row({ e, mine, balance }: { e: LedgerEntry; mine: boolean; balance: number }) {
  const tone = iconTone(e);
  const credit = e.direction === 'credit';
  const who = e.membership?.members?.full_name ?? (e.entry_type === 'expense' ? 'Group' : null);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border, backgroundColor: mine ? semantic.surfaceAlt : 'transparent' }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
        <tone.Icon size={16} color={tone.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>
            {TYPE_LABEL[e.entry_type] ?? e.entry_type}{who ? ` · ${who}` : ''}
          </Text>
          {mine ? <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>· you</Text> : null}
        </View>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>
          {shortDate(e.posted_at)}{e.poster?.full_name ? ` · confirmed by ${e.poster.full_name}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: credit ? intent.success.text : semantic.textPrimary }}>
          {credit ? '+' : '−'}{formatPeso(e.amount)}
        </Text>
        <Text variant="caption" color="muted" style={{ marginTop: 2, fontSize: 10.5 }}>{formatPeso(balance)}</Text>
      </View>
    </View>
  );
}

export default function GroupLedger() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group, membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const fund = useFundSummary(groupId!);
  const ledger = useFundLedger(groupId!);
  const [filter, setFilter] = useState<Filter>('all');

  const entries = ledger.data ?? [];

  // Running balance walked backward from the current cash on hand — entries
  // arrive newest-first, so entries[0]'s balance IS available_cash, and each
  // earlier entry's balance is the one after it minus that later entry's effect.
  const withBalance = useMemo(() => {
    let bal = Number(fund.data?.available_cash ?? 0);
    return entries.map((e) => {
      const row = { e, balance: bal };
      bal -= e.direction === 'credit' ? Number(e.amount) : -Number(e.amount);
      return row;
    });
  }, [entries, fund.data?.available_cash]);

  const filtered = withBalance.filter(({ e }) => {
    if (filter === 'in') return e.direction === 'credit';
    if (filter === 'out') return e.direction === 'debit';
    if (filter === 'mine') return e.membership_id === membership?.id;
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const key = monthKey(row.e.posted_at);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, list]) => ({ label: monthLabel(list[0].e.posted_at), balance: list[0].balance, list }));
  }, [filtered]);

  const cash = Number(fund.data?.available_cash ?? 0);

  // Derived from the entries actually fetched, not group_summary() — that RPC
  // only breaks out 5 of the 9 entry_types (nothing for penalty/adjustment/
  // reversal/fee), so a group with any of those would show a composition
  // that visibly didn't add up to its own total. Summing what's on screen
  // guarantees these rows always reconcile with the total right below them.
  const composition = useMemo(() => {
    const sums = new Map<LedgerEntryType, number>();
    for (const e of entries) {
      const signed = (e.direction === 'credit' ? 1 : -1) * Number(e.amount);
      sums.set(e.entry_type, (sums.get(e.entry_type) ?? 0) + signed);
    }
    const order: LedgerEntryType[] = ['contribution', 'loan_repayment', 'penalty', 'distribution', 'loan_disbursement', 'expense', 'adjustment', 'reversal', 'fee'];
    return order
      .filter((t) => sums.has(t))
      .map((t) => ({ label: COMPOSITION_LABEL[t] ?? (TYPE_LABEL[t] ?? t), v: sums.get(t)!, pos: sums.get(t)! >= 0 }));
  }, [entries]);
  const compositionTotal = composition.reduce((s, r) => s + r.v, 0);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All postings' },
    { key: 'in', label: 'Money in' },
    { key: 'out', label: 'Money out' },
    { key: 'mine', label: 'Mine only' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Fund ledger" subtitle={`${group?.name ?? 'Group'} · ${cycle?.name ?? 'No active cycle'}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Summary ---------------- */}
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Cash on hand</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent.success.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: intent.success.base }} />
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>{entries.length} postings</Text>
            </View>
          </View>
          {fund.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 32, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(cash)}</Text>
          )}
          <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>Every entry below was confirmed by an officer before it posted</Text>

          {composition.length > 0 ? (
            <View style={{ marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: semantic.border, gap: 8 }}>
              {composition.map((row) => (
                <View key={row.label} style={{ flexDirection: 'row' }}>
                  <Text variant="caption" color="secondary">{row.label}</Text>
                  <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: row.pos ? intent.success.text : intent.danger.text }}>
                    {row.pos ? '+' : '−'}{formatPeso(Math.abs(row.v))}
                  </Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', marginTop: 3, paddingTop: 10, borderTopWidth: 1, borderColor: semantic.border }}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>Net of postings shown</Text>
                <Text style={{ marginLeft: 'auto', fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(compositionTotal)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ---------------- Transparency banner ---------------- */}
        <View style={{ marginTop: 15, backgroundColor: intent.info.soft, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(44,110,155,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={14} color={intent.info.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: intent.info.text }}>Everyone in the group can see this</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>
              Amounts and dates are open to every active member. Receipt images aren't shown here — reach one through Contributions, Loans, or Proofs.
            </Text>
          </View>
        </View>

        {/* ---------------- Filters ---------------- */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18 }} contentContainerStyle={{ gap: 7 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 18, backgroundColor: active ? semantic.dashCard : semantic.surface, borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border }}
              >
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ---------------- Postings, grouped by month ---------------- */}
        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : grouped.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 16 }, CARD_SHADOW]}>
            <Text variant="body" color="muted">No postings match this filter.</Text>
          </View>
        ) : (
          grouped.map((g) => (
            <View key={g.label}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 9, marginLeft: 2 }}>
                <Text variant="overline" color="muted">{g.label}</Text>
                <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_700Bold' }}>Balance {formatPeso(g.balance)}</Text>
              </View>
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
                {g.list.map(({ e, balance }) => (
                  <Row key={e.id} e={e} mine={e.membership_id === membership?.id} balance={balance} />
                ))}
              </View>
            </View>
          ))
        )}

        <Text variant="caption" color="secondary" style={{ marginTop: 18, lineHeight: 17, paddingHorizontal: 2 }}>
          Entries are permanent. A mistake is corrected with a reversing entry that stays linked to the original, so nothing is ever quietly deleted.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
