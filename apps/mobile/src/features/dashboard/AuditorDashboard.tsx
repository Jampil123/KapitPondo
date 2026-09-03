import { useMemo, useState, useEffect } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ShieldCheck, CheckCircle2, ArrowUpRight, ArrowDownRight, Undo2, Check, ChevronDown,
  ScrollText, FileText, BarChart3, Receipt,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { useLedger, useMemberBalances } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions, useApproveContribution, useRejectContribution } from '@/features/contributions/contributions.hooks';
import { useExpenses, useApproveExpense, useRejectExpense } from '@/features/expenses/expenses.hooks';
import { useRepayments, useConfirmRepayment, useRejectRepayment } from '@/features/lending/lending.hooks';
import { useReversalRequests, useVerifyReversal, useRejectReversal } from '@/features/ledger/ledger.hooks';
import { useDistributions, useVerifyDistribution, useCancelDistribution } from '@/features/distribution/distribution.hooks';
import type { Contribution } from '@/api/contributions';
import type { Expense } from '@/api/expenses';
import type { LoanPayment } from '@/api/lending';
import type { ReversalRequest } from '@/api/ledger';

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function ageLabel(iso: string): { label: string; aged: boolean } {
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  const aged = hours > 48;
  if (hours < 1) return { label: 'Just now', aged };
  if (hours < 24) return { label: `Waiting ${Math.round(hours)}h`, aged };
  return { label: `Waiting ${Math.round(hours / 24)}d`, aged };
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

function computeAgeHours(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function oldestAgeLabel(hours: number | null): string {
  if (hours === null) return 'None waiting';
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function MiniLegend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#88A9B6' }}>{label}</Text>
    </View>
  );
}

function VerificationHero({ groupId }: { groupId: string }) {
  const { member } = useAuth();
  const { membership } = useActiveGroup();
  const myName = member?.full_name ?? null;
  const { cycle } = useActiveCycle(groupId);

  const contribsForCycle = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const contribsPending = useContributions(groupId, { status: 'submitted' });
  const expensesPending = useExpenses(groupId, { status: 'submitted' });
  const repaymentsPending = useRepayments(groupId, 'submitted');
  const reversalsPending = useReversalRequests(groupId, 'pending_verification');

  const contribsAll = useContributions(groupId, {});
  const expensesAll = useExpenses(groupId, {});
  const repaymentsAll = useRepayments(groupId);
  const reversalsAll = useReversalRequests(groupId);

  const ledger = useLedger(groupId, { limit: 5000 });

  const [expanded, setExpanded] = useState(true);
  const [showHealth, setShowHealth] = useState(false);

  const loading = contribsPending.loading || expensesPending.loading || repaymentsPending.loading || reversalsPending.loading;

  // Stage A — members with no resolved claim yet for the active cycle's current period
  // (same per-member dedup CollectionBlock uses on the Owner/Treasurer dashboards).
  const currentRows = useMemo(() => {
    const rows = contribsForCycle.data ?? [];
    const latestByMember = new Map<string, Contribution>();
    for (const r of rows) {
      const existing = latestByMember.get(r.membership_id);
      const t = new Date(r.due_date ?? r.created_at).getTime();
      const existingT = existing ? new Date(existing.due_date ?? existing.created_at).getTime() : -Infinity;
      if (!existing || t > existingT) latestByMember.set(r.membership_id, r);
    }
    return [...latestByMember.values()];
  }, [contribsForCycle.data]);
  const membersYetToPay = currentRows.filter((r) => r.status === 'pending').length;

  // Stage B — the exact total the "Waiting for you" queue below shows.
  const waitingOnYou = (contribsPending.data?.length ?? 0) + (expensesPending.data?.length ?? 0) + (repaymentsPending.data?.length ?? 0) + (reversalsPending.data?.length ?? 0);

  // Stage C — real ledger entry count.
  const postedCount = ledger.data?.length ?? 0;

  const pendingAges = [
    ...(contribsPending.data ?? []).map((c) => computeAgeHours(c.created_at)),
    ...(expensesPending.data ?? []).map((e) => computeAgeHours(e.created_at)),
    ...(repaymentsPending.data ?? []).map((p) => computeAgeHours(p.created_at)),
    ...(reversalsPending.data ?? []).map((r) => computeAgeHours(r.initiated_at)),
  ];
  const oldestHours = pendingAges.length ? Math.max(...pendingAges) : null;
  const stale = oldestHours !== null && oldestHours > 48;

  const record = useMemo(() => {
    let verified = 0;
    let returned = 0;
    let flagged = 0;
    (contribsAll.data ?? []).forEach((c) => { if (myName && c.approver?.full_name === myName && c.status === 'approved') verified++; });
    (expensesAll.data ?? []).forEach((e) => {
      if (membership && e.approved_by === membership.id) { if (e.status === 'approved') verified++; else if (e.status === 'rejected') returned++; }
    });
    (repaymentsAll.data ?? []).forEach((p) => { if (myName && p.verifier?.full_name === myName && (p.status === 'approved' || p.status === 'paid')) verified++; });
    (reversalsAll.data ?? []).forEach((r) => { if (membership && r.verified_by === membership.id) flagged++; });
    return { verified, returned, flagged };
  }, [contribsAll.data, expensesAll.data, repaymentsAll.data, reversalsAll.data, myName, membership]);

  const handled = record.verified + record.returned + record.flagged;
  const totalPostings = handled + waitingOnYou;
  const pct = totalPostings > 0 ? Math.round((handled / totalPostings) * 100) : 100;

  const proofless = useMemo(() => [
    ...(contribsAll.data ?? []).filter((c) => c.status !== 'rejected' && !c.proof_url),
    ...(expensesAll.data ?? []).filter((e) => e.status !== 'rejected' && !e.proof_url),
    // LoanPayment has no 'rejected' status — a rejected claim just stays without one being reset.
    ...(repaymentsAll.data ?? []).filter((p) => !p.proof_url),
  ].length, [contribsAll.data, expensesAll.data, repaymentsAll.data]);
  const staleCount = pendingAges.filter((h) => h > 48).length;
  const selfApproved = useMemo(() => (expensesAll.data ?? []).filter(
    (e) => e.status === 'approved' && e.recorded_by && e.approved_by && e.recorded_by === e.approved_by,
  ).length, [expensesAll.data]);
  const unlinkedReversals = useMemo(() => (reversalsAll.data ?? []).filter((r) => !r.entry).length, [reversalsAll.data]);

  const checks = [
    { label: 'Every posting has proof attached', failLabel: 'Postings without proof', n: proofless },
    { label: 'Nothing waiting over 48 hours', failLabel: 'Waiting over 48 hours', n: staleCount },
    { label: 'No expense approved by its recorder', failLabel: 'Self-approved expenses', n: selfApproved },
    { label: 'All reversals linked to originals', failLabel: 'Reversals missing an original', n: unlinkedReversals },
  ];
  const issueCount = checks.reduce((s, c) => s + c.n, 0);
  const locked = waitingOnYou > 0;

  useEffect(() => {
    if (waitingOnYou > 0) setExpanded(true);
  }, [waitingOnYou]);

  const checkedAt = useMemo(() => new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), []);
  const totalScanned = (contribsAll.data?.length ?? 0) + (expensesAll.data?.length ?? 0) + (repaymentsAll.data?.length ?? 0) + (reversalsAll.data?.length ?? 0);

  const bg = issueCount > 0 ? '#5A1E16' : !loading && waitingOnYou === 0 ? '#173C30' : semantic.dashCard;

  return (
    <View style={[{ backgroundColor: bg, borderRadius: 18, padding: 16 }, shadowToken.card]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Verification flow</Text>
          <Text style={{ fontSize: 11.5, lineHeight: 15, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            {issueCount > 0 ? `${issueCount} issue${issueCount === 1 ? '' : 's'} found` : !loading && waitingOnYou === 0 ? 'Nothing is sitting with you' : 'Where every posting stands right now'}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowHealth((s) => !s)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: issueCount > 0 ? 'rgba(255,120,100,0.22)' : 'rgba(61,214,140,0.18)', paddingVertical: 6, paddingHorizontal: 9, borderRadius: 20 }}
        >
          <ShieldCheck size={13} color={issueCount > 0 ? '#FFC0B4' : '#7FD9AC'} />
          <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: issueCount > 0 ? '#FFC0B4' : '#7FD9AC' }}>
            {issueCount > 0 ? `${issueCount} issue${issueCount === 1 ? '' : 's'}` : 'All clear'}
          </Text>
          <ChevronDown size={12} color={issueCount > 0 ? '#FFC0B4' : '#7FD9AC'} style={{ transform: [{ rotate: showHealth ? '180deg' : '0deg' }] }} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#7E9CAA' }}>{loading ? '–' : membersYetToPay}</Text>
          <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: '#7E9CAA', marginTop: 5, textAlign: 'center', lineHeight: 12 }}>Members{'\n'}yet to pay</Text>
        </View>
        <View style={{ width: 20, paddingTop: 11 }}>
          <View style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 1 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: 20, height: 2.5, borderRadius: 2, backgroundColor: '#2FA8FF', marginBottom: 4, shadowColor: '#2FA8FF', shadowOpacity: 0.9, shadowRadius: 6 }} />
          <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{loading ? '–' : waitingOnYou}</Text>
          <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#B6D0DA', marginTop: 5, textAlign: 'center', lineHeight: 12 }}>Waiting{'\n'}on you</Text>
        </View>
        <View style={{ width: 20, paddingTop: 11 }}>
          <View style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 1 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#7E9CAA' }}>{loading ? '–' : postedCount}</Text>
          <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: '#7E9CAA', marginTop: 5, textAlign: 'center', lineHeight: 12 }}>Posted{'\n'}to ledger</Text>
        </View>
      </View>

      {expanded ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#9BBAC7' }}>Oldest waiting on you</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 13, fontFamily: 'Poppins_700Bold', color: stale ? '#FFC77D' : '#8CDCB4' }}>{oldestAgeLabel(oldestHours)}</Text>
          </View>

          <View style={{ marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#C4D9E2' }}>{handled} of {totalPostings} postings handled</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#8CDCB4' }}>{pct}%</Text>
            </View>
            <View style={{ height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
              <View style={{ height: '100%', width: (pct + '%') as any, borderRadius: 4, backgroundColor: '#3DD68C' }} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 9 }}>
              <MiniLegend color="#3DD68C" label={`${record.verified} verified`} />
              <MiniLegend color="#FFA98F" label={`${record.returned} returned`} />
              <MiniLegend color="#FFC77D" label={`${record.flagged} flagged`} />
            </View>
          </View>

          {showHealth ? (
            <View style={{ marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.13)', gap: 2 }}>
              {checks.map((c) => (
                <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                  <View style={{ width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.n > 0 ? '#FF8A70' : 'rgba(61,214,140,0.2)' }}>
                    {c.n > 0 ? <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#4A1108' }}>!</Text> : <Check size={10} color="#3DD68C" strokeWidth={3} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_500Medium', color: c.n > 0 ? '#fff' : '#A9C4CF' }}>{c.n > 0 ? c.failLabel : c.label}</Text>
                  {c.n > 0 ? <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#FFC0B4' }}>{c.n}</Text> : null}
                </View>
              ))}
              <Text style={{ fontSize: 10.5, color: '#7E9CAA', fontWeight: '600', marginTop: 8 }}>
                Last scanned today, {checkedAt} · {totalScanned} postings
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <Pressable
        disabled={locked}
        onPress={() => setExpanded((e) => !e)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14,
          marginHorizontal: -16, marginBottom: -16, paddingVertical: 11,
          backgroundColor: 'rgba(255,255,255,0.05)', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
          opacity: locked ? 0.45 : 1,
        }}
      >
        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#88A9B6', letterSpacing: 0.3 }}>
          {locked ? `${waitingOnYou} item${waitingOnYou === 1 ? '' : 's'} waiting` : expanded ? 'Show less' : 'Show my progress'}
        </Text>
        <ChevronDown size={13} color="#88A9B6" style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
      </Pressable>
    </View>
  );
}

/* ---------------- shared queue-card bits ---------------- */
function Tag({ tone, children }: { tone: 'age' | 'ok'; children: React.ReactNode }) {
  const t = tone === 'age' ? intent.warning : intent.success;
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: t.text }}>{children}</Text>
    </View>
  );
}

function QueueCard({ aged, children }: { aged?: boolean; children: React.ReactNode }) {
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, marginBottom: 10, borderLeftWidth: aged ? 4 : 0, borderLeftColor: intent.warning.base }, shadowToken.card]}>
      {children}
    </View>
  );
}

function QueueActions({ busy, onReject, onVerify }: { busy: boolean; onReject: () => void; onVerify: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 9, padding: 14, paddingTop: 0 }}>
      <Pressable disabled={busy} onPress={onReject} style={{ flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center', borderWidth: 1.5, borderColor: semantic.border, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textSecondary }}>Reject</Text>
      </Pressable>
      <Pressable disabled={busy} onPress={onVerify} style={{ flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center', backgroundColor: intent.success.base, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{busy ? '…' : 'Verify'}</Text>
      </Pressable>
    </View>
  );
}

type QueueType = 'contribution' | 'repayment' | 'expense' | 'reversal';
type RejectTarget = { type: QueueType; id: string; label: string };
type FilterKey = 'all' | QueueType;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'repayment', label: 'Repayments' },
  { key: 'expense', label: 'Expenses' },
  { key: 'reversal', label: 'Reversals' },
];

/* ---------------- Verification queue ---------------- */
function VerificationQueue({ groupId }: { groupId: string }) {
  const contribs = useContributions(groupId, { status: 'submitted' });
  const expenses = useExpenses(groupId, { status: 'submitted' });
  const repayments = useRepayments(groupId, 'submitted');
  const reversals = useReversalRequests(groupId, 'pending_verification');
  const balances = useMemberBalances(groupId);

  const approveContrib = useApproveContribution(groupId);
  const rejectContrib = useRejectContribution(groupId);
  const approveExpense = useApproveExpense(groupId);
  const rejectExpense = useRejectExpense(groupId);
  const confirmRepayment = useConfirmRepayment(groupId);
  const rejectRepaymentAction = useRejectRepayment(groupId);
  const verifyReversal = useVerifyReversal(groupId);
  const rejectReversalAction = useRejectReversal(groupId);

  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (balances.data ?? []).forEach((b) => m.set(b.membership_id, b.full_name ?? 'Member'));
    return m;
  }, [balances.data]);

  const contribRows = contribs.data ?? [];
  const expenseRows = expenses.data ?? [];
  const repaymentRows = repayments.data ?? [];
  const reversalRows = reversals.data ?? [];
  const total = contribRows.length + expenseRows.length + repaymentRows.length + reversalRows.length;
  const loading = contribs.loading || expenses.loading || repayments.loading || reversals.loading;

  const showContribs = filter === 'all' || filter === 'contribution';
  const showExpenses = filter === 'all' || filter === 'expense';
  const showRepayments = filter === 'all' || filter === 'repayment';
  const showReversals = filter === 'all' || filter === 'reversal';
  const filteredCount =
    (showContribs ? contribRows.length : 0) + (showExpenses ? expenseRows.length : 0) +
    (showRepayments ? repaymentRows.length : 0) + (showReversals ? reversalRows.length : 0);

  async function handleVerify(target: RejectTarget) {
    setActingId(target.id);
    if (target.type === 'contribution') { await approveContrib.run(target.id); contribs.refetch(); }
    else if (target.type === 'expense') { await approveExpense.run(target.id); expenses.refetch(); }
    else if (target.type === 'repayment') { await confirmRepayment.run(target.id); repayments.refetch(); }
    else { await verifyReversal.run(target.id); reversals.refetch(); }
    setActingId(null);
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    setActingId(target.id);
    if (target.type === 'contribution') { await rejectContrib.run(target.id, reason || undefined); contribs.refetch(); }
    else if (target.type === 'expense') { await rejectExpense.run(target.id, reason || undefined); expenses.refetch(); }
    else if (target.type === 'repayment') { await rejectRepaymentAction.run(target.id, reason || undefined); repayments.refetch(); }
    else { await rejectReversalAction.run(target.id, reason || undefined); reversals.refetch(); }
    setActingId(null);
  }

  return (
    <>
      <SectionHead title="Waiting for you" aside={loading ? undefined : total > 0 ? `${total} waiting` : 'All clear'} tone={total > 0 ? 'hot' : 'calm'} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 7, paddingBottom: 2 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                paddingVertical: 7, paddingHorizontal: 13, borderRadius: 18,
                backgroundColor: active ? semantic.dashCard : semantic.surface,
                borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border,
              }}
            >
              <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 24, alignItems: 'center' }, shadowToken.card]}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : total === 0 ? (
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, shadowToken.card]}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} color={intent.success.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>Nothing waiting on you</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Every posting is verified and on the ledger</Text>
          </View>
        </View>
      ) : (
        <View>
          {showContribs && contribRows.map((c: Contribution) => {
            const age = ageLabel(c.created_at);
            const busy = actingId === c.id;
            return (
              <QueueCard key={c.id} aged={age.aged}>
                <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="overline" color="muted">Contribution</Text>
                    <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }} numberOfLines={1}>{nameById.get(c.membership_id) ?? 'Member'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text variant="caption" color="secondary">{shortDate(c.created_at)}</Text>
                      {age.aged ? <Tag tone="age">{age.label}</Tag> : null}
                    </View>
                  </View>
                  <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(c.amount)}</Text>
                </View>
                <QueueActions
                  busy={busy}
                  onReject={() => setRejectTarget({ type: 'contribution', id: c.id, label: `${nameById.get(c.membership_id) ?? 'this'} contribution` })}
                  onVerify={() => handleVerify({ type: 'contribution', id: c.id, label: '' })}
                />
              </QueueCard>
            );
          })}

          {showExpenses && expenseRows.map((e: Expense) => {
            const age = ageLabel(e.created_at);
            const busy = actingId === e.id;
            return (
              <QueueCard key={e.id} aged={age.aged}>
                <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="overline" color="muted">Expense{e.category ? ` · ${e.category}` : ''}</Text>
                    <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }} numberOfLines={1}>{e.description ?? 'Group expense'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <Text variant="caption" color="secondary">Recorded by {e.recorded_by ? (nameById.get(e.recorded_by) ?? 'an officer') : 'an officer'}</Text>
                      {age.aged ? <Tag tone="age">{age.label}</Tag> : null}
                    </View>
                  </View>
                  <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(e.amount)}</Text>
                </View>
                <QueueActions
                  busy={busy}
                  onReject={() => setRejectTarget({ type: 'expense', id: e.id, label: 'this expense' })}
                  onVerify={() => handleVerify({ type: 'expense', id: e.id, label: '' })}
                />
              </QueueCard>
            );
          })}

          {showRepayments && repaymentRows.map((p: LoanPayment) => {
            const age = ageLabel(p.created_at);
            const busy = actingId === p.id;
            const name = p.loans?.membership?.members?.full_name ?? 'Member';
            return (
              <QueueCard key={p.id} aged={age.aged}>
                <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="overline" color="muted">Loan repayment</Text>
                    <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }} numberOfLines={1}>{name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text variant="caption" color="secondary">{p.recorder?.full_name ? `Recorded by ${p.recorder.full_name} · ` : ''}{shortDate(p.created_at)}</Text>
                      {age.aged ? <Tag tone="age">{age.label}</Tag> : null}
                    </View>
                  </View>
                  <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(p.amount)}</Text>
                </View>
                <QueueActions
                  busy={busy}
                  onReject={() => setRejectTarget({ type: 'repayment', id: p.id, label: `${name}'s repayment` })}
                  onVerify={() => handleVerify({ type: 'repayment', id: p.id, label: '' })}
                />
              </QueueCard>
            );
          })}

          {showReversals && reversalRows.map((r: ReversalRequest) => {
            const age = ageLabel(r.initiated_at);
            const busy = actingId === r.id;
            return (
              <QueueCard key={r.id} aged={age.aged}>
                <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Undo2 size={18} color={semantic.brandDark} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="overline" color="muted">Reversing entry</Text>
                    <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }} numberOfLines={1}>
                      {r.entry?.entry_type.replace(/_/g, ' ') ?? 'Ledger entry'}{r.entry?.description ? ` · ${r.entry.description}` : ''}
                    </Text>
                    {age.aged ? <View style={{ marginTop: 4 }}><Tag tone="age">{age.label}</Tag></View> : null}
                  </View>
                  {r.entry ? <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(r.entry.amount)}</Text> : null}
                </View>

                <View style={{ marginHorizontal: 14, marginBottom: 12, backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12 }}>
                  <Text variant="overline" color="muted" style={{ marginBottom: 3 }}>Reason given</Text>
                  <Text style={{ fontSize: 12, lineHeight: 17, color: semantic.textSecondary }}>{r.reason}</Text>
                </View>

                <View style={{ flexDirection: 'row', paddingHorizontal: 14, marginBottom: 12, gap: 4 }}>
                  {[
                    { label: 'Initiated', done: true },
                    { label: 'You verify', done: false, now: true },
                    { label: 'Owner finalizes', done: false },
                  ].map((s, i) => (
                    <View key={s.label} style={{ flex: 1, alignItems: 'center' }}>
                      <View style={{
                        width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: s.done ? intent.success.base : s.now ? intent.info.base : semantic.surface,
                      }}>
                        {s.done ? <Check size={10} color="#fff" strokeWidth={3} /> : <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: s.now ? '#fff' : semantic.textMuted }}>{i + 1}</Text>}
                      </View>
                      <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: s.now ? intent.info.text : semantic.textMuted, marginTop: 4, textAlign: 'center' }}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                <QueueActions
                  busy={busy}
                  onReject={() => setRejectTarget({ type: 'reversal', id: r.id, label: 'this reversal' })}
                  onVerify={() => handleVerify({ type: 'reversal', id: r.id, label: '' })}
                />
              </QueueCard>
            );
          })}

          {filteredCount === 0 ? (
            <Text variant="body" color="muted" style={{ textAlign: 'center', padding: 20 }}>Nothing in this filter right now.</Text>
          ) : null}
        </View>
      )}

      <ReasonPrompt
        visible={!!rejectTarget}
        title={`Reject ${rejectTarget?.label ?? 'this item'}?`}
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
      />
    </>
  );
}

/* ---------------- Year-end verification: contextual, real gates ---------------- */
function Gate({ done, now, label }: { done: boolean; now?: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#3DD68C' : now ? '#2FA8FF' : 'rgba(255,255,255,0.16)' }}>
        {done ? <Check size={11} color="#0B3323" strokeWidth={3} /> : null}
      </View>
      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: done || now ? '#C4D9E2' : '#8FA9B5' }}>{label}</Text>
    </View>
  );
}

function YearEndVerification({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { data, refetch } = useDistributions(groupId);
  const verify = useVerifyDistribution(groupId);
  const cancel = useCancelDistribution(groupId);

  const current = useMemo(() => (data ?? []).find((d) => d.status === 'previewed') ?? null, [data]);
  if (!current) return null;

  async function onVerify() {
    const ok = await verify.run(current!.id);
    if (ok) refetch();
  }
  async function onReturn() {
    const ok = await cancel.run(current!.id);
    if (ok) refetch();
  }

  return (
    <>
      <SectionHead title="Year-end preview" aside="Owner is waiting" tone="hot" />
      <View style={{ backgroundColor: semantic.dashCard, borderRadius: 18, padding: 16 }}>
        <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Verify the distribution figures</Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: '#A9C4CF', marginTop: 6 }}>
          The Treasurer prepared this preview. Nothing is paid out until you verify and the Owner finalizes.
        </Text>

        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.13)', flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: '#A9C4CF' }}>Total to distribute · {current.period}</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(current.total_amount)}</Text>
        </View>

        <View style={{ marginTop: 14, gap: 9 }}>
          <Gate done label={`Preview prepared by Treasurer · ${shortDate(current.created_at)}`} />
          <Gate done={false} now label="Your verification" />
          <Gate done={false} label="Owner finalizes — becomes permanent" />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable disabled={cancel.loading} onPress={onReturn} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.11)' }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#C4D9E2' }}>Return to Treasurer</Text>
          </Pressable>
          <Pressable disabled={verify.loading} onPress={() => go('distribution/year-end')} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.surfaceAlt }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Open full breakdown</Text>
          </Pressable>
        </View>
        <Pressable disabled={verify.loading} onPress={onVerify} style={{ marginTop: 8, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#2FA8FF' }}>
          <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: '#052A47' }}>{verify.loading ? 'Verifying…' : 'Verify this preview'}</Text>
        </Pressable>
      </View>
    </>
  );
}

/* ---------------- My verification record ---------------- */
function RecordStat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 19, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{n}</Text>
      <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: semantic.textSecondary, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function VerificationRecord({ groupId }: { groupId: string }) {
  const { member } = useAuth();
  const { membership } = useActiveGroup();
  const myName = member?.full_name ?? null;

  const contribs = useContributions(groupId, {});
  const expenses = useExpenses(groupId, {});
  const repayments = useRepayments(groupId);
  const reversals = useReversalRequests(groupId);

  const loading = contribs.loading || expenses.loading || repayments.loading || reversals.loading;

  const counts = useMemo(() => {
    let verified = 0;
    let returned = 0;
    let flagged = 0;

    (contribs.data ?? []).forEach((c) => {
      if (myName && c.approver?.full_name === myName) { if (c.status === 'approved') verified++; }
    });
    (expenses.data ?? []).forEach((e) => {
      if (membership && e.approved_by === membership.id) { if (e.status === 'approved') verified++; else if (e.status === 'rejected') returned++; }
    });
    (repayments.data ?? []).forEach((p) => {
      if (myName && p.verifier?.full_name === myName) { if (p.status === 'approved' || p.status === 'paid') verified++; }
    });
    (reversals.data ?? []).forEach((r) => {
      if (membership && r.verified_by === membership.id) flagged++;
    });

    return { verified, returned, flagged };
  }, [contribs.data, expenses.data, repayments.data, reversals.data, myName, membership]);

  return (
    <>
      <SectionHead title="My verification record" />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, shadowToken.card]}>
        {loading ? (
          <ActivityIndicator color={semantic.brand} />
        ) : (
          <View style={{ flexDirection: 'row' }}>
            <RecordStat n={counts.verified} label="Verified" />
            <View style={{ width: 1, backgroundColor: semantic.border }} />
            <RecordStat n={counts.returned} label="Returned" />
            <View style={{ width: 1, backgroundColor: semantic.border }} />
            <RecordStat n={counts.flagged} label="Flagged" />
          </View>
        )}
      </View>
    </>
  );
}

/* ---------------- Recent verifications ---------------- */
function contributorName(e: { membership: { members: { full_name: string } | null } | null }) {
  return e.membership?.members?.full_name ?? null;
}

function RecentVerifications({ groupId }: { groupId: string }) {
  const ledger = useLedger(groupId, { limit: 5 });
  const txns = ledger.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: txns.length ? 6 : 20 }, shadowToken.card]}>
      {ledger.loading ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 14 }} />
      ) : txns.length === 0 ? (
        <Text variant="body" color="muted" style={{ textAlign: 'center' }}>No verifications yet.</Text>
      ) : (
        txns.map((e, i) => {
          const name = contributorName(e);
          const credit = e.direction === 'credit';
          return (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < txns.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={16} color={intent.success.text} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="label" style={{ fontSize: 12.5 }} numberOfLines={1}>{name ?? e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {name ? `${e.description ?? e.entry_type.replace(/_/g, ' ')} · ` : ''}{shortDate(e.posted_at)}
                </Text>
              </View>
              {credit ? <ArrowDownRight size={17} color={intent.success.text} /> : <ArrowUpRight size={17} color={semantic.textPrimary} />}
            </View>
          );
        })
      )}
    </View>
  );
}

// Ledger and Reports/Proofs are distinct real screens (no route serves double duty
// here): Ledger → the raw transaction ledger, Audit log → the postings review/
// decision trail, Reports → the aggregate member-balances report, Proofs → the
// dedicated proof-review screen. Same routes AuditorNav's "More" sheet already uses.
const LOOKUP_ACTIONS: { label: string; icon: any; route: string }[] = [
  { label: 'Ledger', icon: ScrollText, route: 'reports/group-ledger' },
  { label: 'Audit Log', icon: FileText, route: 'audit/log' },
  { label: 'Reports', icon: BarChart3, route: 'reports/member-balances' },
  { label: 'Proofs', icon: Receipt, route: 'audit/proofs' },
];

export function AuditorDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });

  return (
    <>
      <VerificationHero groupId={groupId} />

      <YearEndVerification groupId={groupId} go={go} />

      <VerificationQueue groupId={groupId} />

      <VerificationRecord groupId={groupId} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {LOOKUP_ACTIONS.map((a) => (
          <Pressable
            key={a.route}
            onPress={() => go(a.route)}
            style={[{ width: '23%', borderRadius: 18, backgroundColor: semantic.surface, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, shadowToken.card]}
          >
            <a.icon size={26} color={semantic.brandDark} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHead title="Recent verifications" aside="Posted to ledger" />
      <RecentVerifications groupId={groupId} />
    </>
  );
}
