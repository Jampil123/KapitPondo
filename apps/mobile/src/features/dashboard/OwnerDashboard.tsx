/**
 * features/dashboard/OwnerDashboard.tsx
 * ----------------------------------------------------------------------------
 * The Owner's dashboard home, restructured per the "decision queue" reference
 * (kapitpondo-owner-dashboard): fund composition instead of a lone cash
 * figure, real pending items instead of bare counters, an actual collection
 * progress block, a "cycle closing" card that only appears once a year-end
 * distribution needs the Owner's finalization, a manage grid, and a real
 * group-wide activity feed. Every value below comes from hooks that already
 * existed — this pass changes how they're grouped and rendered, not what's
 * fetched. Approve/Reject stay on their existing dedicated screens (approving
 * a loan needs an interest-rate input, rejecting can take a reason) — cards
 * here are tap-to-review previews, not new inline mutations.
 *
 * Data status:
 *   fund composition        → useSummary            ✅ real (cash + disbursed-repaid = on loan)
 *   cycle status pill       → useActiveCycle         ✅ real
 *   decision queue rows     → useLoans/listPendingMembers/usePenalties ✅ real (same lists the old counters used)
 *   loan eligibility chips  → useLoanEligibility      ✅ real (per-loan, already-existing endpoint)
 *   this period's collection→ useContributions        ✅ real (cycle-scoped rows, officer sees all members)
 *   cycle closing gates     → useDistributions        ✅ real (status only — no preparer/verifier name or date is tracked server-side, so gates 2 & 3 don't claim one)
 *   recent activity         → useLedger               ✅ real (same hook TreasurerDashboard already uses)
 */
import { useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@/hooks/useApi';
import {
  Users, Coins, AlertTriangle, SlidersHorizontal, UserCheck, CalendarClock,
  Wallet, ScrollText, Receipt, CheckCircle2, Check, ArrowUpRight, ArrowDownRight, X,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { semantic, intent } from '@/theme/colors';

// A softer, lower-contrast shadow than the shared shadowToken.card (opacity
// 0.07) — barely-there lift instead of a visibly dark edge under each card.
const SOFT_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
  elevation: 1, boxShadow: '0px 2px 10px rgba(42,62,75,0.04)',
} as const;
import { formatPeso } from '@/lib/money';
import { useSummary, useLedger } from '@/features/reporting/reporting.hooks';
import { useLoans, useLoanEligibility } from '@/features/lending/lending.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { usePenalties } from '@/features/penalties/penalties.hooks';
import { useDistributions } from '@/features/distribution/distribution.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { buildTimeline, currentPeriodIndex } from '@/features/contributions/periods';
import { listPendingMembers, listMembers } from '@/api/groups';
import type { Loan } from '@/api/lending';
import type { Penalty } from '@/api/penalties';

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function SectionHead({ title, aside, hot, onAsidePress }: { title: string; aside?: string; hot?: boolean; onAsidePress?: () => void }) {
  const asideText = aside ? (
    <Text variant="caption" style={{ fontFamily: 'Poppins_600SemiBold', color: hot ? intent.danger.text : onAsidePress ? semantic.brandDark : semantic.textSecondary }}>{aside}</Text>
  ) : null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {onAsidePress && asideText ? <Pressable onPress={onAsidePress} hitSlop={8}>{asideText}</Pressable> : asideText}
    </View>
  );
}

/* ---------------- Fund card: composition, not a lone figure ---------------- */
const CYCLE_DOT: Record<string, string> = { active: '#3DD68C', draft: '#8FB0BC', closed: '#8FB0BC' };

function FundCard({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  const { cycle } = useActiveCycle(groupId);

  const cash = Number(data?.available_cash ?? 0);
  const onLoan = Math.max(0, Number(data?.total_loan_disbursements ?? 0) - Number(data?.total_loan_repayments ?? 0));
  const total = cash + onLoan;
  const cashPct = total > 0 ? (cash / total) * 100 : 100;
  const lentPct = 100 - cashPct;

  return (
    <LinearGradient
      colors={[semantic.brand, semantic.dashCard]}
      style={[{ borderRadius: 20, padding: 15 }, SOFT_SHADOW]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Text variant="overline" style={{ color: 'rgba(255,255,255,0.55)' }}>Fund value</Text>
        {cycle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(61,214,140,0.16)', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: CYCLE_DOT[cycle.status] ?? '#8FB0BC' }} />
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#7FD9AC' }}>{cycle.status === 'active' ? 'Active' : cycle.status === 'draft' ? 'Draft' : 'Closed'}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
      ) : (
        <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: -0.8 }}>{formatPeso(total)}</Text>
      )}

      <View style={{ flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden', marginVertical: 10, backgroundColor: 'rgba(255,255,255,0.14)' }}>
        <View style={{ width: (cashPct + '%') as any, backgroundColor: '#8FB0BC' }} />
        <View style={{ width: (lentPct + '%') as any, backgroundColor: '#E4A33C' }} />
      </View>

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: '#8FB0BC' }} />
          <Text style={{ fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', color: '#A9C4CF' }}>Cash on hand</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(cash)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: '#E4A33C' }} />
          <Text style={{ fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', color: '#A9C4CF' }}>Out on loan</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(onLoan)}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

/* ---------------- Decision queue: real rows, not bare counters ---------------- */
function Chip({ tone, children }: { tone: 'pass' | 'fail' | 'warn'; children: ReactNode }) {
  const t = tone === 'pass' ? intent.success : tone === 'fail' ? intent.danger : intent.warning;
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 8, paddingVertical: 4.5, borderRadius: 8 }}>
      <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: t.text }}>{children}</Text>
    </View>
  );
}

function DecisionCard({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 16, gap: 12, marginBottom: 10 }, SOFT_SHADOW]}>
      {children}
    </Pressable>
  );
}

function DecisionHead({ type, name, sub, amount }: { type: string; name: string; sub: string; amount?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text variant="overline" color="muted">{type}</Text>
        <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 4 }}>{name}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
      </View>
      {amount ? <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{amount}</Text> : null}
    </View>
  );
}

function LoanDecisionCard({ groupId, loan, onPress }: { groupId: string; loan: Loan; onPress: () => void }) {
  const { data: elig, loading } = useLoanEligibility(groupId, loan.id);
  const name = loan.membership?.members?.full_name ?? 'Member';
  return (
    <DecisionCard onPress={onPress}>
      <DecisionHead
        type="Loan request"
        name={name}
        sub={`Requested ${shortDate(loan.applied_at)} · ${loan.term_months} months${loan.purpose ? ` · ${loan.purpose}` : ''}`}
        amount={formatPeso(loan.principal)}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {loading ? (
          <ActivityIndicator size="small" color={semantic.brand} />
        ) : elig ? (
          <>
            <Chip tone={elig.eligible ? 'pass' : 'fail'}>{elig.eligible ? 'Eligible' : 'Not eligible'}</Chip>
            <Chip tone={Number(elig.available_cash) >= Number(loan.principal) ? 'pass' : 'fail'}>Liquidity {formatPeso(elig.available_cash)}</Chip>
            {elig.reasons.map((r) => <Chip key={r} tone="warn">{r}</Chip>)}
          </>
        ) : null}
      </View>
      <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_600SemiBold' }}>Tap to review →</Text>
    </DecisionCard>
  );
}

type PendingMemberRow = { id: string; name: string; date: string | null; verification: string | null };
function normalizePendingMember(item: any): PendingMemberRow {
  return {
    id: item?.member_id ?? item?.members?.id ?? item?.member?.id ?? item?.id,
    name: item?.full_name ?? item?.name ?? item?.members?.full_name ?? item?.member?.full_name ?? 'Member',
    date: item?.created_at ?? item?.joined_at ?? null,
    verification: item?.verification_status ?? item?.members?.verification_status ?? item?.member?.verification_status ?? null,
  };
}

function MembershipDecisionCard({ row, onPress }: { row: PendingMemberRow; onPress: () => void }) {
  return (
    <DecisionCard onPress={onPress}>
      <DecisionHead type="Membership request" name={row.name} sub={row.date ? `Joined ${shortDate(row.date)}` : 'Awaiting review'} />
      {row.verification ? (
        <View style={{ flexDirection: 'row' }}>
          <StatusBadge entity="verification" value={row.verification} />
        </View>
      ) : null}
      <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_600SemiBold' }}>Tap to review →</Text>
    </DecisionCard>
  );
}

function PenaltyDecisionCard({ penalty, onPress }: { penalty: Penalty; onPress: () => void }) {
  const name = penalty.membership?.members?.full_name ?? 'Member';
  return (
    <DecisionCard onPress={onPress}>
      <DecisionHead type="Penalty review" name={name} sub={`${penalty.reason} · applied ${shortDate(penalty.created_at)}`} amount={formatPeso(penalty.amount)} />
      <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_600SemiBold' }}>Tap to review →</Text>
    </DecisionCard>
  );
}

function EmptyQueue({ decidedCount }: { decidedCount: number }) {
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, SOFT_SHADOW]}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={18} color={intent.success.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>Nothing waiting on you</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {decidedCount > 0 ? `${decidedCount} decision${decidedCount === 1 ? '' : 's'} made this cycle` : 'New requests will show up here'}
        </Text>
      </View>
    </View>
  );
}

/* ---------------- Action-required stat tile (kept — the "see all of X" surface) ---------------- */
type Tone = 'accent' | 'warn' | 'danger';
const TONE: Record<Tone, { bg: string; fg: string; dot: string }> = {
  accent: { bg: '#EAF2F6', fg: '#5E8497', dot: '#7FA6B8' },
  warn: { bg: '#F8EFDA', fg: '#A87C2C', dot: '#A87C2C' },
  danger: { bg: '#F7E5E5', fg: '#C25C5E', dot: '#C25C5E' },
};
function StatTile({ icon: Icon, count, label, tone, onPress }: { icon: any; count: number; label: string; tone: Tone; onPress: () => void }) {
  const t = TONE[tone];
  return (
    <Pressable onPress={onPress} style={[{ flex: 1, backgroundColor: semantic.surface, borderRadius: 16, padding: 13 }, SOFT_SHADOW]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={t.fg} strokeWidth={1.8} />
        </View>
        {count > 0 ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot }} /> : null}
      </View>
      <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, lineHeight: 28 }}>{count}</Text>
      <Text variant="caption" color="secondary" style={{ marginTop: 3, fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}

function DecisionQueue({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const pendingLoans = useLoans(groupId, { status: 'pending' });
  const pendingMembersQ = useQuery(
    () => listPendingMembers(groupId),
    [groupId],
    { table: 'memberships', filter: `group_id=eq.${groupId}` },
  );
  const pendingPenalties = usePenalties(groupId, 'pending');
  const decidedPenalties = usePenalties(groupId, 'waived');

  const loans = pendingLoans.data ?? [];
  const members = (Array.isArray(pendingMembersQ.data) ? pendingMembersQ.data : []).map(normalizePendingMember);
  const penalties = pendingPenalties.data ?? [];
  const total = loans.length + members.length + penalties.length;

  const loading = pendingLoans.loading || pendingMembersQ.loading || pendingPenalties.loading;

  return (
    <>
      <SectionHead title="Needs your decision" aside={loading ? undefined : total > 0 ? `${total} waiting` : 'All clear'} hot={total > 0} />

      {loading ? (
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 24, alignItems: 'center' }, SOFT_SHADOW]}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : total === 0 ? (
        <EmptyQueue decidedCount={decidedPenalties.data?.length ?? 0} />
      ) : (
        <View>
          {loans.slice(0, 2).map((loan) => (
            <LoanDecisionCard key={loan.id} groupId={groupId} loan={loan} onPress={() => go('loans/decisions')} />
          ))}
          {members.slice(0, 2).map((row) => (
            <MembershipDecisionCard key={row.id} row={row} onPress={() => go('members/approvals')} />
          ))}
          {penalties.slice(0, 1).map((p) => (
            <PenaltyDecisionCard key={p.id} penalty={p} onPress={() => go('penalties')} />
          ))}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <StatTile icon={UserCheck} count={members.length} label="Membership requests" tone="accent" onPress={() => go('members/approvals')} />
            <StatTile icon={Coins} count={loans.length} label="Loan decisions" tone="warn" onPress={() => go('loans/decisions')} />
            <StatTile icon={AlertTriangle} count={penalties.length} label="Penalties to review" tone="danger" onPress={() => go('penalties')} />
          </View>
        </View>
      )}
    </>
  );
}

/* ---------------- This period's collection — the fact the old screen was missing ---------------- */
// The denominator here used to be "members with a contribution row for this
// cycle" — but a member who hasn't paid a single period yet has NO row at
// all (nothing auto-creates one; see periods.ts), so they were silently
// dropped from both the count and the peso total instead of showing up as
// outstanding. Pulled from the full active roster (listMembers) instead.
// Each member's status comes from buildTimeline() at THE SAME calendar
// period index for everyone (currentPeriodIndex) — not each member's own
// first-unpaid period, which would make a member's payment disappear from
// "this month" the instant it's approved and their own progress rolls
// forward to next month.
function CollectionBlock({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { cycle } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const membersQ = useQuery(() => listMembers(groupId), [groupId]);

  const rows = contribs.data ?? [];
  const roster = membersQ.data ?? [];

  const summary = useMemo(() => {
    if (!cycle || roster.length === 0) return null;
    const rowsByMember = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = rowsByMember.get(r.membership_id);
      if (list) list.push(r); else rowsByMember.set(r.membership_id, [r]);
    }

    // Expected is every active member's heads × this cycle's per-head rate — a plain
    // roster total, independent of anyone's individual payment history. (What each
    // member has actually paid can differ from that, which is exactly the gap this
    // widget exists to show — deriving "expected" from paid amounts would hide it.)
    const totalHeads = roster.reduce((s, m) => s + m.heads, 0);
    const expected = totalHeads * Number(cycle.contribution_amount);

    let collected = 0;
    let collectedCount = 0;
    let lateCount = 0;
    let latestDue: string | null = null;

    // The SAME calendar period for every member — not each member's own first
    // unpaid one. Otherwise a member who's already paid this month has their
    // "current" period roll forward to next month the instant it's approved,
    // and their payment disappears from THIS month's collected total.
    const periodIdx = currentPeriodIndex(cycle);

    for (const m of roster) {
      const timeline = buildTimeline(cycle, rowsByMember.get(m.id) ?? [], m.heads);
      const entry = periodIdx !== null ? (timeline[periodIdx] ?? null) : (timeline[timeline.length - 1] ?? null);
      if (!entry) continue; // open-ended cycle, this member has no rows yet — nothing to compare against
      if (entry.kind === 'paid') { collected += entry.amount; collectedCount++; }
      if (entry.kind === 'late') lateCount++;
      if (!latestDue) latestDue = entry.dueDate.toISOString(); // same period for everyone now, so the same due date
    }

    return { expected, collected, collectedCount, lateCount, latestDue, totalMembers: roster.length };
  }, [cycle, roster, rows]);

  if (!cycle || !summary) return null;

  const pct = summary.expected > 0 ? Math.min(100, Math.round((summary.collected / summary.expected) * 100)) : 0;

  return (
    <>
      <SectionHead title="This month's collection" aside={summary.latestDue ? `Due ${shortDate(summary.latestDue)}` : undefined} />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 17 }, SOFT_SHADOW]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 }}>
          <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>
            {formatPeso(summary.collected)} <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>of {formatPeso(summary.expected)}</Text>
          </Text>
          <Text style={{ fontSize: 10.5, lineHeight: 13, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>{summary.collectedCount} of {summary.totalMembers} members</Text>
        </View>
        <View style={{ height: 9, borderRadius: 5, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: (pct + '%') as any, borderRadius: 5, backgroundColor: semantic.brand }} />
        </View>

        {summary.lateCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderColor: semantic.border }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: intent.danger.soft, alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={15} color={intent.danger.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{summary.lateCount} member{summary.lateCount === 1 ? '' : 's'} overdue</Text>
              <Text variant="caption" color="secondary" style={{ fontSize: 10.5, lineHeight: 13, marginTop: 2 }}>Past the due date</Text>
            </View>
            <Pressable onPress={() => go('contributions/confirm')} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>View</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );
}

/* ---------------- Cycle closing: contextual, never ambient ---------------- */
function FinalizeCard({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { data } = useDistributions(groupId);

  const current = useMemo(() => {
    if (!data) return null;
    const inFlight = data.filter((d) => d.status !== 'finalized' && d.status !== 'draft');
    if (!inFlight.length) return null;
    return inFlight.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [data]);

  if (!current) return null;

  const verified = current.status === 'verified';

  return (
    <>
      <SectionHead title="Cycle closing" />
      <View style={{ backgroundColor: semantic.dashCard, borderRadius: 20, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 11 }}>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(47,168,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarClock size={15} color="#8ACBFF" />
          </View>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Year-end distribution</Text>
        </View>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: '#A9C4CF' }}>
          Finalizing posts every payout and locks the cycle permanently. It cannot be reopened.
        </Text>

        <View style={{ marginVertical: 14, gap: 9 }}>
          <Gate done label={`Preview prepared · ${shortDate(current.created_at)}`} />
          <Gate done={verified} label="Verified by Auditor" />
          <Gate done={false} label="Your finalization" />
        </View>

        <Pressable
          disabled={!verified}
          onPress={() => go('distribution/year-end')}
          style={{
            width: '100%', paddingVertical: 14, borderRadius: 13, alignItems: 'center',
            backgroundColor: verified ? '#2FA8FF' : 'rgba(255,255,255,0.1)',
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: verified ? '#052A47' : '#7794A2' }}>
            {verified ? 'Review preview, then finalize' : 'Waiting on Auditor verification'}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 11, color: '#87A5B2', textAlign: 'center', marginTop: 9, fontWeight: '600' }}>
          You'll see the full breakdown before anything is locked.
        </Text>
      </View>
    </>
  );
}

function Gate({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#3DD68C' : 'rgba(255,255,255,0.16)' }}>
        {done ? <Check size={11} color="#0B3323" strokeWidth={3} /> : null}
      </View>
      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: done ? '#C4D9E2' : '#8FA9B5' }}>{label}</Text>
    </View>
  );
}

const PRIMARY_ACTIONS: { label: string; icon: any; key: string }[] = [
  { label: 'Manage Officers', icon: Users, key: 'members/officers' },
  { label: 'Group Ledger', icon: ScrollText, key: 'reports/group-ledger' },
  { label: 'Member Balances', icon: Wallet, key: 'reports/member-balances' },
  { label: 'Configure Cycle', icon: SlidersHorizontal, key: 'cycles/configure' },
];
const ALL_ACTIONS: { label: string; icon: any; key: string }[] = [
  ...PRIMARY_ACTIONS,
  { label: 'Year-End Distribution', icon: CalendarClock, key: 'distribution/year-end' },
  { label: 'Expenses', icon: Receipt, key: 'expenses/record' },
];

function ManageSheet({ visible, onClose, go }: { visible: boolean; onClose: () => void; go: (r: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text variant="h3" style={{ fontSize: 17, flex: 1 }}>Manage</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
          </View>
          <View style={{ gap: 10 }}>
            {ALL_ACTIONS.map((a) => (
              <Pressable
                key={a.key}
                onPress={() => { onClose(); go(a.key); }}
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: semantic.background, borderRadius: 14, padding: 13 }, SOFT_SHADOW]}
              >
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <a.icon size={20} color={semantic.brandDark} />
                </View>
                <Text variant="label" style={{ flex: 1 }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------------- Recent activity — group-wide, real ledger feed ---------------- */
function contributorName(e: { membership: { members: { full_name: string } | null } | null }) {
  return e.membership?.members?.full_name ?? null;
}

function RecentActivity({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const ledger = useLedger(groupId, { limit: 5 });
  const entries = ledger.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: entries.length ? 6 : 20 }, SOFT_SHADOW]}>
      {ledger.loading ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 14 }} />
      ) : entries.length === 0 ? (
        <Text variant="body" color="muted" style={{ textAlign: 'center' }}>No recent activity yet.</Text>
      ) : (
        <>
          {entries.map((e, i) => {
            const credit = e.direction === 'credit';
            const Icon = credit ? ArrowDownRight : ArrowUpRight;
            const name = contributorName(e);
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={credit ? intent.success.text : semantic.brandDark} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{name ? `${e.entry_type.replace(/_/g, ' ')} · ${name}` : e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>{shortDate(e.posted_at)}</Text>
                </View>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: credit ? intent.success.text : semantic.textPrimary }}>
                  {credit ? '+' : '-'}{formatPeso(e.amount)}
                </Text>
              </View>
            );
          })}
          <Pressable onPress={() => go('reports/group-ledger')} style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderColor: semantic.border }}>
            <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '700' }}>See full audit trail</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function OwnerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [manageOpen, setManageOpen] = useState(false);
  const go = (sub: string) => router.push({ pathname: `/(app)/[groupId]/${sub}` as any, params: { groupId } });

  return (
    <>
      <FundCard groupId={groupId} />

      <FinalizeCard groupId={groupId} go={go} />

      <DecisionQueue groupId={groupId} go={go} />

      <CollectionBlock groupId={groupId} go={go} />

      <SectionHead title="Manage" aside="View all" onAsidePress={() => setManageOpen(true)} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {PRIMARY_ACTIONS.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => go(a.key)}
            style={[{ width: '23%', borderRadius: 18, backgroundColor: semantic.surface, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, SOFT_SHADOW]}
          >
            <a.icon size={26} color={semantic.brandDark} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <ManageSheet visible={manageOpen} onClose={() => setManageOpen(false)} go={go} />

      <SectionHead title="Recent activity" aside="Group-wide" />
      <RecentActivity groupId={groupId} go={go} />
    </>
  );
}
