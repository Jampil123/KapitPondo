/**
 * features/dashboard/TreasurerDashboard.tsx
 * ----------------------------------------------------------------------------
 * The Treasurer's dashboard home, restructured per the reference
 * (kapitpondo-treasurer-dashboard): cash reconciled as one statement instead
 * of three loose boxes, real work lists instead of bare counters ("confirm"
 * relabeled to "review"/"release" — those are recording acts, not the
 * Auditor's approval), who still owes on the dashboard, and a 4-tile Record
 * grid. Every value below comes from hooks that already existed — this pass
 * changes how they're grouped and rendered, not what's fetched.
 *
 * Two sections from the reference were dropped rather than faked:
 *   - "Needs correction" (Auditor returns a posted entry) — no such workflow
 *     exists; a contribution/expense either gets approved (posts once,
 *     immediately) or rejected before posting. There's no post-posting return.
 *   - "Awaiting Auditor" (recorded-but-not-yet-verified) — confirmed absent
 *     by AuditorDashboard.tsx itself ("no discrepancy/flag API", "reversal is
 *     owner-only; no auditor-verify step"). A single officer's approval posts
 *     straight to the ledger; there's no second sign-off stage to show here.
 * Year-End Preview and Confirm Disbursement left the grid (matching the
 * reference) but stay reachable — Confirm Disbursement folds into "To
 * release" below, and Year-End Preview is already in TreasurerNav's "More"
 * sheet, so nothing lost.
 *
 * Data status:
 *   cash reconciliation   → useSummary          ✅ real (received/paid rows sum to available_cash)
 *   proofs to review      → useContributions/useRepayments ✅ real (same 'submitted' lists the old counters used)
 *   member names on them  → useMemberBalances    ✅ real (Contribution has no membership name of its own)
 *   to release            → useLoans (approved)  ✅ real (Loan already carries the borrower's name)
 *   this month's collection→ useContributions    ✅ real (same per-member dedup CollectionBlock uses on the Owner dashboard)
 *   recent transactions   → useLedger            ✅ real (unchanged)
 */
import { useMemo, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowUpRight, Repeat, Minus, BarChart3, ArrowDownRight, CheckCircle2,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useSummary, useLedger, useMemberBalances } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useLoans, useRepayments } from '@/features/lending/lending.hooks';
import type { Contribution } from '@/api/contributions';
import type { Loan } from '@/api/lending';

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function SectionHead({ title, aside, tone }: { title: string; aside?: string; tone?: 'hot' | 'calm' }) {
  const color = tone === 'hot' ? intent.danger.text : tone === 'calm' ? intent.success.text : semantic.textSecondary;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" style={{ fontFamily: 'Poppins_600SemiBold', color }}>{aside}</Text> : null}
    </View>
  );
}

/* ---------------- Cash card: one reconciled statement ---------------- */
const CYCLE_DOT: Record<string, string> = { active: '#3DD68C', draft: '#8FB0BC', closed: '#8FB0BC' };

function CashRow({ label, amount, tone }: { label: string; amount: number; tone: 'pos' | 'neg' }) {
  const sign = tone === 'pos' ? '+' : '−';
  const color = tone === 'pos' ? '#8CDCB4' : '#F0A99E';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_500Medium', color: '#A9C4CF' }}>{label}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_700Bold', color }}>{sign}{formatPeso(amount)}</Text>
    </View>
  );
}

function CashCard({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  const { cycle } = useActiveCycle(groupId);

  const contributions = Number(data?.total_contributions ?? 0);
  const repayments = Number(data?.total_loan_repayments ?? 0);
  const expenses = Number(data?.total_expenses ?? 0);
  const disbursed = Number(data?.total_loan_disbursements ?? 0);
  const distributed = Number(data?.total_distributions ?? 0);
  const owedBack = Math.max(0, disbursed - repayments);

  return (
    <View style={[{ backgroundColor: semantic.dashCard, borderRadius: 18, padding: 13 }, shadowToken.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text variant="overline" style={{ color: 'rgba(255,255,255,0.55)' }}>Cash on hand</Text>
        {cycle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(61,214,140,0.16)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CYCLE_DOT[cycle.status] ?? '#8FB0BC' }} />
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#7FD9AC' }}>{cycle.status === 'active' ? 'Active' : cycle.status === 'draft' ? 'Draft' : 'Closed'}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
      ) : (
        <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: -0.7 }}>{formatPeso(data?.available_cash)}</Text>
      )}

      <View style={{ marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.13)', gap: 4 }}>
        <CashRow label="Contributions received" amount={contributions} tone="pos" />
        <CashRow label="Repayments received" amount={repayments} tone="pos" />
        <CashRow label="Expenses paid" amount={expenses} tone="neg" />
        <CashRow label="Loans released" amount={disbursed} tone="neg" />
        {distributed > 0 ? <CashRow label="Distributions paid" amount={distributed} tone="neg" /> : null}

        {owedBack > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 7, marginTop: 1, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}>
            <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_500Medium', color: '#A9C4CF' }}>Owed back by members</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_700Bold', color: '#F2C67D' }}>{formatPeso(owedBack)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ---------------- shared row bits ---------------- */
function Tag({ tone, children }: { tone: 'late' | 'ok'; children: ReactNode }) {
  const t = tone === 'late' ? intent.danger : intent.success;
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: t.text }}>{children}</Text>
    </View>
  );
}

function EmptyRow({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, shadowToken.card]}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={18} color={intent.success.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

/* ---------------- Proofs to review ---------------- */
type ProofRow = { id: string; name: string; sub: string; amount: number; late?: boolean };

function ProofsToReview({ groupId, go }: { groupId: string; go: (r: string, p?: Record<string, string>) => void }) {
  const pendingContribs = useContributions(groupId, { status: 'submitted' });
  const pendingRepayments = useRepayments(groupId, 'submitted');
  const balances = useMemberBalances(groupId);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (balances.data ?? []).forEach((b) => m.set(b.membership_id, b.full_name ?? 'Member'));
    return m;
  }, [balances.data]);

  const contribRows: ProofRow[] = (pendingContribs.data ?? []).map((c: Contribution) => ({
    id: c.id,
    name: nameById.get(c.membership_id) ?? 'Member',
    sub: `Contribution · sent ${shortDate(c.created_at)}`,
    amount: Number(c.amount),
    late: c.is_late,
  }));
  const repayRows: ProofRow[] = (pendingRepayments.data ?? []).map((p) => ({
    id: p.id,
    name: p.loans?.membership?.members?.full_name ?? 'Member',
    sub: `Loan repayment · sent ${shortDate(p.created_at)}`,
    amount: Number(p.amount),
  }));

  const rows = [...contribRows, ...repayRows];
  const loading = pendingContribs.loading || pendingRepayments.loading || balances.loading;

  return (
    <>
      <SectionHead title="Proofs to review" aside={loading ? undefined : rows.length > 0 ? `${rows.length} waiting` : 'All clear'} tone={rows.length > 0 ? 'hot' : 'calm'} />

      {loading ? (
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 24, alignItems: 'center' }, shadowToken.card]}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyRow title="No proofs waiting" sub="New submissions will show up here" />
      ) : (
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20 }, shadowToken.card]}>
          {rows.slice(0, 4).map((r, i) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: i < Math.min(rows.length, 4) - 1 ? 1 : 0, borderColor: semantic.border }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{r.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text variant="caption" color="secondary" numberOfLines={1}>{r.sub}</Text>
                  {r.late ? <Tag tone="late">Late</Tag> : null}
                </View>
              </View>
              <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(r.amount)}</Text>
            </View>
          ))}
          <Pressable onPress={() => go('contributions/confirm', { tab: 'pending' })} style={{ padding: 13, alignItems: 'center', backgroundColor: semantic.surfaceAlt, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Review all</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

/* ---------------- To release ---------------- */
function ToRelease({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { data } = useSummary(groupId);
  const approvedLoans = useLoans(groupId, { status: 'approved' });
  const loans = approvedLoans.data ?? [];
  const cash = Number(data?.available_cash ?? 0);

  if (approvedLoans.loading) {
    return (
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 24, alignItems: 'center' }, shadowToken.card]}>
        <ActivityIndicator color={semantic.brand} />
      </View>
    );
  }
  if (loans.length === 0) return null;

  function borrowerName(loan: Loan) { return loan.membership?.members?.full_name ?? 'Member'; }

  return (
    <>
      <SectionHead title="To release" aside={`${loans.length} waiting`} tone="hot" />
      <View>
        {loans.slice(0, 2).map((loan) => {
          const covered = cash >= Number(loan.principal);
          return (
            <View key={loan.id} style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 16, marginBottom: 10 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{borrowerName(loan)}</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Approved by Owner · {shortDate(loan.approved_at)} · {loan.term_months} months</Text>
                </View>
                <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(loan.approved_principal ?? loan.principal)}</Text>
              </View>
              <View style={{ marginTop: 10 }}>
                <Tag tone={covered ? 'ok' : 'late'}>{covered ? `Cash on hand covers this · ${formatPeso(cash)}` : `Short by ${formatPeso(Number(loan.principal) - cash)}`}</Tag>
              </View>
              <Pressable onPress={() => go('loans/disburse')} style={{ marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.brandDark }}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Release funds & enter reference no.</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </>
  );
}

/* ---------------- This month's collection ---------------- */
function CollectionBlock({ groupId, go }: { groupId: string; go: (r: string, p?: Record<string, string>) => void }) {
  const { cycle } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const balances = useMemberBalances(groupId);

  const rows = contribs.data ?? [];
  // "This period" = each member's most recent contribution row for this cycle — see
  // OwnerDashboard's identical CollectionBlock for why due_date grouping isn't safe.
  const currentRows = useMemo(() => {
    const latestByMember = new Map<string, Contribution>();
    for (const r of rows) {
      const existing = latestByMember.get(r.membership_id);
      const t = new Date(r.due_date ?? r.created_at).getTime();
      const existingT = existing ? new Date(existing.due_date ?? existing.created_at).getTime() : -Infinity;
      if (!existing || t > existingT) latestByMember.set(r.membership_id, r);
    }
    return [...latestByMember.values()];
  }, [rows]);

  const nameById = useMemo(() => {
    const m = new Map<string, { name: string; heads: number }>();
    (balances.data ?? []).forEach((b) => m.set(b.membership_id, { name: b.full_name ?? 'Member', heads: b.heads }));
    return m;
  }, [balances.data]);

  const currentDue = currentRows.reduce<string | null>((latest, r) => {
    if (!r.due_date) return latest;
    return !latest || new Date(r.due_date) > new Date(latest) ? r.due_date : latest;
  }, null);
  const expected = currentRows.reduce((s, r) => s + Number(r.amount), 0);
  const collected = currentRows.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount), 0);
  const collectedCount = currentRows.filter((r) => r.status === 'approved').length;
  const owingRows = currentRows.filter((r) => r.status === 'pending');
  const owingSum = owingRows.reduce((s, r) => s + Number(r.amount), 0);
  const pct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;

  if (!cycle || currentRows.length === 0) return null;

  const shown = owingRows.slice(0, 2);
  const rest = owingRows.length - shown.length;

  return (
    <>
      <SectionHead title="This month's collection" aside={currentDue ? `Due ${shortDate(currentDue)}` : undefined} />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 17 }, shadowToken.card]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>
            {formatPeso(collected)} <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>of {formatPeso(expected)}</Text>
          </Text>
          <Text style={{ fontSize: 10.5, lineHeight: 13, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>{collectedCount} of {currentRows.length} members</Text>
        </View>
        <View style={{ height: 9, borderRadius: 5, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: (pct + '%') as any, borderRadius: 5, backgroundColor: semantic.brand }} />
        </View>

        {owingRows.length > 0 ? (
          <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: semantic.border, gap: 10 }}>
            {shown.map((r) => {
              const info = nameById.get(r.membership_id);
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>
                      {(info?.name ?? 'M').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{info?.name ?? 'Member'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                      <Text variant="caption" color="secondary">{info?.heads ?? 1} head{(info?.heads ?? 1) === 1 ? '' : 's'}</Text>
                      {r.is_late ? <Tag tone="late">Late</Tag> : null}
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(r.amount)}</Text>
                </View>
              );
            })}
            {rest > 0 ? (
              <Pressable onPress={() => go('contributions/confirm')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>+{rest}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{rest} more member{rest === 1 ? '' : 's'} owing</Text>
                  <Text variant="caption" color="secondary">{formatPeso(owingSum - shown.reduce((s, r) => s + Number(r.amount), 0))} outstanding</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable onPress={() => go('contributions/confirm', { tab: 'record' })} style={{ marginTop: 15, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.surfaceAlt }}>
          <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Record a contribution</Text>
        </Pressable>
      </View>
    </>
  );
}

/* ---------------- Record grid ---------------- */
const ACTIONS: { label: string; icon: any; route: string; params?: Record<string, string> }[] = [
  { label: 'Contribution', icon: ArrowUpRight, route: 'contributions/confirm', params: { tab: 'record' } },
  { label: 'Repayment', icon: Repeat, route: 'loans/record-repayment' },
  { label: 'Expense', icon: Minus, route: 'expenses/record' },
  { label: 'Reports', icon: BarChart3, route: 'reports/group-ledger' },
];

/* ---------------- Recent transactions ---------------- */
function contributorName(e: { membership: { members: { full_name: string } | null } | null }) {
  return e.membership?.members?.full_name ?? null;
}

function RecentTransactions({ groupId }: { groupId: string }) {
  const ledger = useLedger(groupId, { limit: 5 });
  const txns = ledger.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: txns.length ? 6 : 20 }, shadowToken.card]}>
      {ledger.loading ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 14 }} />
      ) : txns.length === 0 ? (
        <Text variant="body" color="muted" style={{ textAlign: 'center' }}>No transactions yet.</Text>
      ) : (
        txns.map((e, i) => {
          const credit = e.direction === 'credit';
          const Icon = credit ? ArrowDownRight : ArrowUpRight;
          const name = contributorName(e);
          return (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < txns.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={credit ? intent.success.text : semantic.brandDark} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{name ?? e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {name ? `${e.description ?? e.entry_type.replace(/_/g, ' ')} · ` : ''}{shortDate(e.posted_at)}
                  </Text>
                  <Tag tone="ok">Posted</Tag>
                </View>
              </View>
              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: credit ? intent.success.text : semantic.textPrimary }}>
                {credit ? '+' : '-'}{formatPeso(e.amount)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

export function TreasurerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string, extraParams?: Record<string, string>) =>
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId, ...extraParams } });

  return (
    <>
      <CashCard groupId={groupId} />

      <ProofsToReview groupId={groupId} go={go} />

      <ToRelease groupId={groupId} go={go} />

      <CollectionBlock groupId={groupId} go={go} />

      <SectionHead title="Record" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => go(a.route, a.params)}
            style={[{ width: '23%', borderRadius: 18, backgroundColor: semantic.surface, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, shadowToken.card]}
          >
            <a.icon size={26} color={semantic.brandDark} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHead title="Recent transactions" aside="Posted" />
      <RecentTransactions groupId={groupId} />
    </>
  );
}
