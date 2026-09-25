import { useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Alert } from '@/lib/alert';
import { useRouter } from 'expo-router';
import { useQuery, useAction } from '@/hooks/useApi';
import {
  Users, AlertTriangle, SlidersHorizontal, CalendarClock,
  Wallet, ScrollText, CheckCircle2, Check, X, Clock3,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, intent, steel, shadowToken } from '@/theme/colors';
import { DashboardBand, FoldTarget, glassPanel, onBandText } from '@/components/shared/DashboardBand';


import { formatPeso } from '@/lib/money';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { useLoans, useLoanEligibility, useApproveLoan, useRejectLoan } from '@/features/lending/lending.hooks';
import { useSignoffQueue } from '@/features/signoff/signoff';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { usePenalties, useWaivePenalty } from '@/features/penalties/penalties.hooks';
import { useDistributions } from '@/features/distribution/distribution.hooks';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import { describe, ROLE_LABEL } from '@/features/auditlog/describe';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { buildTimeline, currentPeriodIndex } from '@/features/contributions/periods';
import { listPendingMembers, listMembers, approveMember, rejectMember, listOfficers, approveGcashProposal, rejectGcashProposal } from '@/api/groups';
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
function FundCard({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  const { cycle } = useActiveCycle(groupId);

  const cash = Number(data?.available_cash ?? 0);
  const onLoan = Math.max(0, Number(data?.total_loan_disbursements ?? 0) - Number(data?.total_loan_repayments ?? 0));
  const total = cash + onLoan;
  const cashPct = total > 0 ? (cash / total) * 100 : 100;
  const lentPct = 100 - cashPct;

  return (
    <View style={{ paddingTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Text variant="overline" style={{ color: onBandText }}>Fund value</Text>
        {cycle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: intent.success.soft, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cycle.status === 'active' ? intent.success.base : semantic.textMuted }} />
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: cycle.status === 'active' ? intent.success.text : semantic.textSecondary }}>{cycle.status === 'active' ? 'Active' : cycle.status === 'draft' ? 'Draft' : 'Closed'}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
      ) : (
        <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>{formatPeso(total)}</Text>
      )}

      <View style={[glassPanel, { padding: 12, marginTop: 12 }]}>
        <View style={{ flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 10, backgroundColor: semantic.surfaceAlt }}>
          <View style={{ width: (cashPct + '%') as any, backgroundColor: steel[400] }} />
          <View style={{ width: (lentPct + '%') as any, backgroundColor: intent.danger.base }} />
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: steel[400] }} />
            <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>Cash on hand</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{formatPeso(cash)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: intent.danger.base }} />
            <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>Out on loan</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{formatPeso(onLoan)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---------------- Decision queue: real rows, not bare counters ---------------- */
function Chip({ tone, children }: { tone: 'pass' | 'fail' | 'warn'; children: ReactNode }) {
  const t = tone === 'pass' ? intent.success : tone === 'fail' ? intent.danger : intent.warning;
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 8, paddingVertical: 1.5, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: t.text }}>{children}</Text>
    </View>
  );
}

// Small, corner-anchored — a quick decision without leaving the dashboard.
// Sits at the bottom-right of each DecisionCard, below the rest of its content.
function QuickAction({ label, tone, Icon, onPress, disabled }: { label: string; tone: 'ok' | 'danger'; Icon: any; onPress: () => void; disabled?: boolean }) {
  // Approve uses the app's primary button color; reject stays a soft red.
  const t = tone === 'ok' ? { soft: semantic.brandDark, text: '#fff' } : intent.danger;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.soft, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 11, opacity: disabled ? 0.5 : 1 }}
    >
      <Icon size={12} color={t.text} strokeWidth={2.6} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.text }}>{label}</Text>
    </Pressable>
  );
}

function DecisionCard({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, gap: 12, marginBottom: 10 }, shadowToken.soft]}>
      {children}
    </Pressable>
  );
}

function DecisionHead({ type, name, sub, amount }: { type: string; name: string; sub: string; amount?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text variant="overline" color="muted">{type}</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary, marginTop: 4 }}>{name}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
      </View>
      {amount ? <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{amount}</Text> : null}
    </View>
  );
}

function LoanDecisionCard({ groupId, loan, onPress, onChanged, moreCount }: { groupId: string; loan: Loan; onPress: () => void; onChanged: () => void; moreCount?: number }) {
  const { data: elig, loading } = useLoanEligibility(groupId, loan.id);
  const { cycle } = useActiveCycle(groupId);
  const approveLoan = useApproveLoan(groupId);
  const reject = useRejectLoan(groupId);
  const [rejecting, setRejecting] = useState(false);
  const name = loan.membership?.members?.full_name ?? 'Member';
  // This cycle has a configured default rate (cycles/configure.tsx), so
  // there's nothing left to type in — approving here directly, instead of
  // sending the Owner to the full Loan Decisions page just to re-enter a
  // rate that's already known, removes a redundant extra screen.
  const hasCycleRate = cycle?.default_interest_rate != null;

  async function doApprove(rate: number, amount: number) {
    const ok = await approveLoan.run(loan.id, rate, String(amount));
    if (ok !== undefined) onChanged();
    else if (approveLoan.error) Alert.alert('Could not approve', approveLoan.error.message);
  }

  function onApprove() {
    if (!hasCycleRate) return onPress(); // no default rate to approve with — needs the full review screen
    const rate = Number(cycle!.default_interest_rate);
    const available = Number(elig?.available_cash ?? 0);
    const amount = available > 0 && available < Number(loan.principal) ? available : Number(loan.principal);
    const partial = amount < Number(loan.principal);
    Alert.alert(
      'Approve this loan?',
      `${formatPeso(amount)}${partial ? ` of the ${formatPeso(loan.principal)} requested (fund cash is short)` : ''} at ${(rate * 100).toFixed(2)}% monthly, ${loan.term_months} month${loan.term_months === 1 ? '' : 's'}, for ${name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => doApprove(rate, amount) },
      ],
    );
  }

  async function onRejectConfirm(reason: string) {
    setRejecting(false);
    const ok = await reject.run(loan.id, reason || undefined);
    if (ok !== undefined) onChanged();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  return (
    <DecisionCard onPress={onPress}>
      <DecisionHead
        type="Loan request"
        name={name}
        sub={`Requested ${shortDate(loan.applied_at)} · ${loan.term_months} months${loan.purpose ? ` · ${loan.purpose}` : ''}`}
        amount={formatPeso(loan.principal)}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {loading ? (
            <ActivityIndicator size="small" color={semantic.brand} />
          ) : elig ? (
            <>
              <Chip tone={elig.eligible ? 'pass' : 'fail'}>{elig.eligible ? 'Eligible' : 'Not eligible'}</Chip>
              {elig.reasons.map((r) => <Chip key={r} tone="warn">{r}</Chip>)}
            </>
          ) : null}
        </View>
        {/* Lower-right of the card, flexed alongside the eligibility chips above.
            Approves directly using this cycle's default rate when one is
            configured; only falls back to the full review screen when there's
            no rate to approve with (nothing to default to). */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <QuickAction label="Reject" tone="danger" Icon={X} onPress={() => setRejecting(true)} disabled={reject.loading} />
          <QuickAction label="Approve" tone="ok" Icon={Check} onPress={onApprove} disabled={approveLoan.loading} />
        </View>
      </View>
      {moreCount ? (
        <Pressable onPress={onPress} style={{ paddingTop: 11, borderTopWidth: 1, borderColor: semantic.border }}>
          <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
            View all {moreCount} loan request{moreCount === 1 ? '' : 's'}
          </Text>
        </Pressable>
      ) : null}
      <ReasonPrompt
        visible={rejecting}
        title={`Reject ${name}'s loan request?`}
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejecting(false)}
        onConfirm={onRejectConfirm}
      />
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

function MembershipDecisionCard({ groupId, row, onPress, onChanged, moreCount }: { groupId: string; row: PendingMemberRow; onPress: () => void; onChanged: () => void; moreCount?: number }) {
  const approve = useAction((id: string) => approveMember(groupId, id));
  const reject = useAction(({ id, reason }: { id: string; reason: string }) => rejectMember(groupId, id, reason || undefined));
  const [rejecting, setRejecting] = useState(false);
  const busy = approve.loading || reject.loading;

  async function onApprove() {
    const ok = await approve.run(row.id);
    if (ok !== undefined) onChanged();
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }
  async function onRejectConfirm(reason: string) {
    setRejecting(false);
    const ok = await reject.run({ id: row.id, reason });
    if (ok !== undefined) onChanged();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  return (
    <DecisionCard onPress={onPress}>
      <DecisionHead type="Membership request" name={row.name} sub={row.date ? `Joined ${shortDate(row.date)}` : 'Awaiting review'} />
      {/* Verification banner and actions flexed on the same row — actions still land lower-right. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {row.verification ? <StatusBadge entity="verification" value={row.verification} /> : <View />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <QuickAction label="Reject" tone="danger" Icon={X} onPress={() => setRejecting(true)} disabled={busy} />
          <QuickAction label="Approve" tone="ok" Icon={Check} onPress={onApprove} disabled={busy} />
        </View>
      </View>
      {moreCount ? (
        <Pressable onPress={onPress} style={{ paddingTop: 11, borderTopWidth: 1, borderColor: semantic.border }}>
          <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
            View all {moreCount} membership request{moreCount === 1 ? '' : 's'}
          </Text>
        </Pressable>
      ) : null}
      <ReasonPrompt
        visible={rejecting}
        title={`Reject ${row.name}?`}
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejecting(false)}
        onConfirm={onRejectConfirm}
      />
    </DecisionCard>
  );
}

function PenaltyDecisionCard({ groupId, penalty, onPress, onChanged, moreCount }: { groupId: string; penalty: Penalty; onPress: () => void; onChanged: () => void; moreCount?: number }) {
  const waive = useWaivePenalty(groupId);
  const [waiving, setWaiving] = useState(false);
  const name = penalty.membership?.members?.full_name ?? 'Member';

  async function onWaiveConfirm(reason: string) {
    setWaiving(false);
    const ok = await waive.run(penalty.id, reason);
    if (ok !== undefined) onChanged();
    else if (waive.error) Alert.alert('Could not waive', waive.error.message);
  }

  return (
    <DecisionCard onPress={onPress}>
      <DecisionHead type="Penalty review" name={name} sub={`${penalty.reason} · applied ${shortDate(penalty.created_at)}`} amount={formatPeso(penalty.amount)} />
      {/* Penalties only support "waive" — there's no separate approve/confirm step. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <QuickAction label="Waive" tone="danger" Icon={X} onPress={() => setWaiving(true)} disabled={waive.loading} />
      </View>
      {moreCount ? (
        <Pressable onPress={onPress} style={{ paddingTop: 11, borderTopWidth: 1, borderColor: semantic.border }}>
          <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
            View all {moreCount} penalt{moreCount === 1 ? 'y' : 'ies'} to review
          </Text>
        </Pressable>
      ) : null}
      <ReasonPrompt
        visible={waiving}
        title={`Waive ${name}'s penalty?`}
        confirmLabel="Waive"
        destructive
        onCancel={() => setWaiving(false)}
        onConfirm={onWaiveConfirm}
      />
    </DecisionCard>
  );
}

function GcashDecisionCard({ groupId, submittedAt, onPress, onChanged }: { groupId: string; submittedAt: string | null; onPress: () => void; onChanged: () => void }) {
  const officers = useQuery(() => listOfficers(groupId), [groupId]);
  const treasurerName = officers.data?.officers.find((o) => o.role === 'treasurer')?.full_name ?? 'The Treasurer';
  const approve = useAction(() => approveGcashProposal(groupId));
  const reject = useAction((reason: string) => rejectGcashProposal(groupId, reason));
  const [rejecting, setRejecting] = useState(false);
  const busy = approve.loading || reject.loading;

  async function onApprove() {
    const ok = await approve.run();
    if (ok !== undefined) onChanged();
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }
  async function onRejectConfirm(reason: string) {
    setRejecting(false);
    if (!reason.trim()) return Alert.alert('Reason required', 'Explain what needs to be corrected before resubmission.');
    const ok = await reject.run(reason.trim());
    if (ok !== undefined) onChanged();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  return (
    <DecisionCard onPress={onPress}>
      <DecisionHead type="GCash proposal" name={treasurerName} sub={`Submitted ${shortDate(submittedAt)}`} />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <QuickAction label="Reject" tone="danger" Icon={X} onPress={() => setRejecting(true)} disabled={busy} />
        <QuickAction label="Approve" tone="ok" Icon={Check} onPress={onApprove} disabled={busy} />
      </View>
      <ReasonPrompt
        visible={rejecting}
        title="Reject this GCash proposal?"
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejecting(false)}
        onConfirm={onRejectConfirm}
      />
    </DecisionCard>
  );
}

/** Records waiting on the Organizer's sign-off in the two-step flow (migration 0075):
 * the Treasurer's own money, the Auditor's own, releasing the Treasurer's loan,
 * verifying the release of the Auditor's loan. One card — the queue does the work. */
function SignoffCard({ groupId, count, first }: { groupId: string; count: number; first: { name: string; label: string; amount: string | number | null } }) {
  const router = useRouter();
  return (
    <DecisionCard onPress={() => router.push({ pathname: '/(app)/[groupId]/signoffs' as any, params: { groupId } })}>
      <DecisionHead
        type={count === 1 ? 'Needs your sign-off' : `${count} need your sign-off`}
        name={first.name}
        sub={`${first.label}${first.amount != null ? ` · ${formatPeso(first.amount)}` : ''}${count > 1 ? ` and ${count - 1} more` : ''}`}
      />
    </DecisionCard>
  );
}

function EmptyQueue({ decidedCount }: { decidedCount: number }) {
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, shadowToken.soft]}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={18} color={intent.success.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>Nothing waiting on you</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {decidedCount > 0 ? `${decidedCount} decision${decidedCount === 1 ? '' : 's'} made this cycle` : 'New requests will show up here'}
        </Text>
      </View>
    </View>
  );
}

type DecisionItem =
  | { kind: 'loan'; date: string; loan: Loan }
  | { kind: 'member'; date: string; row: PendingMemberRow }
  | { kind: 'penalty'; date: string; penalty: Penalty }
  | { kind: 'gcash'; date: string }
  | { kind: 'signoff'; date: string };

function DecisionQueue({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { group, membership } = useActiveGroup();
  const { refresh: refreshGroups } = useGroups();
  const pendingLoans = useLoans(groupId, { status: 'pending' });
  const pendingMembersQ = useQuery(
    () => listPendingMembers(groupId),
    [groupId],
    { table: 'memberships', filter: `group_id=eq.${groupId}` },
  );
  const pendingPenalties = usePenalties(groupId, 'pending');
  const decidedPenalties = usePenalties(groupId, 'waived');
  const signoff = useSignoffQueue(groupId);

  // The Owner can't decide on their own loan (no-self-approval rule — the
  // Treasurer reviews those instead, see lending.routes.js), so it must not
  // appear in the Owner's own "needs your decision" queue.
  const loans = (pendingLoans.data ?? []).filter((l) => l.membership_id !== membership?.id);
  const members = (Array.isArray(pendingMembersQ.data) ? pendingMembersQ.data : []).map(normalizePendingMember);
  const penalties = pendingPenalties.data ?? [];
  const gcashPending = group?.treasurer_gcash_status === 'pending';
  const signoffMine = signoff.mine;
  const total = loans.length + members.length + penalties.length + (gcashPending ? 1 : 0) + signoffMine.length;

  const loading = pendingLoans.loading || pendingMembersQ.loading || pendingPenalties.loading || (signoff.loading && signoff.items.length === 0);

  function onChanged() {
    pendingLoans.refetch();
    pendingMembersQ.refetch();
    pendingPenalties.refetch();
    signoff.refetch();
    refreshGroups();
  }

  const items: DecisionItem[] = useMemo(() => {
    const list: DecisionItem[] = [
      ...loans.map((loan) => ({ kind: 'loan' as const, date: loan.applied_at, loan })),
      ...members.map((row) => ({ kind: 'member' as const, date: row.date ?? new Date(0).toISOString(), row })),
      ...penalties.map((penalty) => ({ kind: 'penalty' as const, date: penalty.created_at, penalty })),
      ...(gcashPending ? [{ kind: 'gcash' as const, date: group?.treasurer_gcash_submitted_at ?? new Date(0).toISOString() }] : []),
      ...(signoffMine.length ? [{ kind: 'signoff' as const, date: signoffMine[0].since }] : []),
    ];
    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [loans, members, penalties, gcashPending, group?.treasurer_gcash_submitted_at, signoffMine]);

  const visible = items.slice(0, 2);

  return (
    <>
      <SectionHead title="Pending Actions" aside={loading ? undefined : total > 0 ? `${total} waiting` : 'All clear'} hot={total > 0} />

      {loading ? (
        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 24, alignItems: 'center' }, shadowToken.soft]}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : total === 0 ? (
        <EmptyQueue decidedCount={decidedPenalties.data?.length ?? 0} />
      ) : (
        <View>
          {visible.map((item, i) => {
            const isLast = i === visible.length - 1;
            if (item.kind === 'loan') {
              const visibleOfKind = visible.filter((v) => v.kind === 'loan').length;
              const moreCount = isLast && loans.length > visibleOfKind ? loans.length : undefined;
              return <LoanDecisionCard key={`loan-${item.loan.id}`} groupId={groupId} loan={item.loan} onPress={() => go('loans/decisions')} onChanged={onChanged} moreCount={moreCount} />;
            }
            if (item.kind === 'member') {
              const visibleOfKind = visible.filter((v) => v.kind === 'member').length;
              const moreCount = isLast && members.length > visibleOfKind ? members.length : undefined;
              return <MembershipDecisionCard key={`member-${item.row.id}`} groupId={groupId} row={item.row} onPress={() => go('members/approvals')} onChanged={onChanged} moreCount={moreCount} />;
            }
            if (item.kind === 'gcash') {
              return <GcashDecisionCard key="gcash-proposal" groupId={groupId} submittedAt={group?.treasurer_gcash_submitted_at ?? null} onPress={() => go('group/settings')} onChanged={onChanged} />;
            }
            if (item.kind === 'signoff') {
              return <SignoffCard key="signoff" groupId={groupId} count={signoffMine.length} first={signoffMine[0]} />;
            }
            const visibleOfKind = visible.filter((v) => v.kind === 'penalty').length;
            const moreCount = isLast && penalties.length > visibleOfKind ? penalties.length : undefined;
            return <PenaltyDecisionCard key={`penalty-${item.penalty.id}`} groupId={groupId} penalty={item.penalty} onPress={() => go('penalties')} onChanged={onChanged} moreCount={moreCount} />;
          })}
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
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 17 }, shadowToken.soft]}>
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
];

/**
 * Every manage action in one horizontally-scrollable row, with a thin
 * "scroll level" track beneath it showing how far through the row you are —
 * standalone tiles don't hint that there's more off-screen, this does.
 */
function ManageRow({ go }: { go: (r: string) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [visibleWidth, setVisibleWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const scrollable = contentWidth > visibleWidth + 1;
  const thumbWidth = scrollable ? Math.max(28, (visibleWidth / contentWidth) * trackWidth) : trackWidth;
  const maxScrollX = Math.max(1, contentWidth - visibleWidth);
  const maxThumbTravel = Math.max(0, trackWidth - thumbWidth);
  const thumbLeft = scrollable ? Math.min(maxThumbTravel, (scrollX / maxScrollX) * maxThumbTravel) : 0;

  // Exactly 4 tiles fill the row's full width (same edges as the cards above/
  // below it) — same math as the original static 4-up grid, just computed
  // from the measured width instead of a '23%' flex width, since a
  // horizontal ScrollView's content isn't stretched to fit its viewport.
  const GAP = 10;
  const tileWidth = visibleWidth > 0 ? (visibleWidth - GAP * 3) / 4 : 84;

  return (
    <View style={{ marginTop: 14 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setVisibleWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: GAP, paddingVertical: 6 }}
      >
        {ALL_ACTIONS.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => go(a.key)}
            style={[{ width: tileWidth, borderRadius: 18, backgroundColor: semantic.card, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, shadowToken.soft]}
          >
            <a.icon size={26} color={NAV_BG} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {scrollable ? (
        <View
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={{ width: 56, height: 3, borderRadius: 1.5, backgroundColor: semantic.border, marginTop: 18, alignSelf: 'center', overflow: 'hidden' }}
        >
          <View style={{ width: thumbWidth, height: '100%', borderRadius: 1.5, backgroundColor: semantic.brand, transform: [{ translateX: thumbLeft }] }} />
        </View>
      ) : null}
    </View>
  );
}

/* ---------------- Activity — what officers decided (audit log), not money movements ---------------- */
const ACTIVITY_TONE: Record<string, { bg: string; fg: string }> = {
  good: { bg: intent.success.soft, fg: intent.success.text },
  bad: { bg: intent.danger.soft, fg: intent.danger.text },
  neutral: { bg: semantic.surfaceAlt, fg: semantic.brandDark },
};

function RecentActivity({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const router = useRouter();
  const log = useAuditLog(groupId, { limit: 5 });
  const entries = log.data ?? [];

  return (
    <View>
      {log.loading && !log.data ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 14 }} />
      ) : entries.length === 0 ? (
        <Text variant="body" color="muted" style={{ paddingVertical: 8, paddingHorizontal: 2 }}>No activity yet.</Text>
      ) : (
        <>
          {entries.map((e, i) => {
            const d = describe(e);
            const tone = ACTIVITY_TONE[d.toBad ? 'bad' : d.toGood ? 'good' : 'neutral'];
            const Icon = d.toBad ? X : d.toGood ? Check : Clock3;
            const who = e.actor?.full_name ? `${e.actor.full_name}${e.actor_role ? ` (${ROLE_LABEL[e.actor_role] ?? e.actor_role})` : ''}` : null;
            return (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/(app)/[groupId]/owner-activity/[id]' as any, params: { groupId, id: e.id, at: e.created_at } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 2, borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderColor: semantic.border }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={tone.fg} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="label" style={{ fontSize: 13 }}>{d.title}</Text>
                  <Text variant="caption" color="secondary">{who ? `${who} · ` : ''}{shortDate(e.created_at)}</Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={() => go('owner-activity')} style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderColor: semantic.border }}>
            <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '700' }}>See all activity</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function OwnerHero({ groupId }: { groupId: string }) {
  return (
    <DashboardBand>
      <FoldTarget>
        <FundCard groupId={groupId} />
      </FoldTarget>
    </DashboardBand>
  );
}

export function OwnerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (sub: string) => router.push({ pathname: `/(app)/[groupId]/${sub}` as any, params: { groupId } });

  return (
    <>
      <FinalizeCard groupId={groupId} go={go} />

      <DecisionQueue groupId={groupId} go={go} />

      <CollectionBlock groupId={groupId} go={go} />

      <ManageRow go={go} />

      <SectionHead title="Activity" />
      <RecentActivity groupId={groupId} go={go} />
    </>
  );
}
