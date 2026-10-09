import { useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { useRouter } from 'expo-router';
import { useQuery, useAction } from '@/hooks/useApi';
import {
  Users, AlertTriangle, SlidersHorizontal, CalendarClock,
  Wallet, ScrollText, CheckCircle2, Check, X, Clock3, Download,
  Eye,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
import { ScrollTileRow, type TileAction } from '@/components/shared/ScrollTileRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, intent, steel, shadowToken } from '@/theme/colors';
import { DashboardBand, FoldTarget, glassPanel, onBandText } from '@/components/shared/DashboardBand';


import { formatPeso } from '@/lib/money';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { useLoans, useLoanEligibility } from '@/features/lending/lending.hooks';
import { LoanDecisionSheet } from '@/features/lending/LoanDecisionSheet';
import { useSignoffQueue } from '@/features/signoff/signoff';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { usePenalties, useWaivePenalty } from '@/features/penalties/penalties.hooks';
import { useAuth } from '@/context/AuthContext';
import { useDistributions } from '@/features/distribution/distribution.hooks';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import { AuditTimeline } from '@/features/auditlog/AuditTimeline';
import { CollectionBlock } from './CollectionBlock';
import { listPendingMembers, approveMember, rejectMember, listOfficers, approveGcashProposal, rejectGcashProposal } from '@/api/groups';
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

function LoanDecisionCard({ groupId, loan, onView, onSeeAll, moreCount }: { groupId: string; loan: Loan; onView: () => void; onSeeAll: () => void; moreCount?: number }) {
  const { data: elig, loading } = useLoanEligibility(groupId, loan.id);
  const name = loan.membership?.members?.full_name ?? 'Member';

  // Tap anywhere (or View) for the pull-up details, where Approve / Reject live.
  return (
    <DecisionCard onPress={onView}>
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
        <Pressable onPress={onView} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: semantic.brandDark, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 12 }}>
          <Eye size={12} color="#fff" strokeWidth={2.6} />
          <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>View</Text>
        </Pressable>
      </View>
      {moreCount ? (
        <Pressable onPress={onSeeAll} style={{ paddingTop: 11, borderTopWidth: 1, borderColor: semantic.border }}>
          <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
            View all {moreCount} loan request{moreCount === 1 ? '' : 's'}
          </Text>
        </Pressable>
      ) : null}
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
  const { member } = useAuth();
  const [waiving, setWaiving] = useState(false);
  const name = penalty.membership?.members?.full_name ?? 'Member';
  const own = penalty.membership?.member_id === member?.id;

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
        {own
          ? <Text variant="caption" color="muted">Your own penalty. The Auditor waives it.</Text>
          : <QuickAction label="Waive" tone="danger" Icon={X} onPress={() => setWaiving(true)} disabled={waive.loading} />}
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
        placeholder="Reason for waiving this penalty (required)"
        confirmLabel="Waive"
        destructive
        required
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

  // One card per kind of action (the oldest of each), so nothing waiting gets
  // pushed off the dashboard; each card links to its full list for the rest.
  const visible = items.filter((it, i) => items.findIndex((x) => x.kind === it.kind) === i);
  const [viewLoan, setViewLoan] = useState<Loan | null>(null);

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
          {visible.map((item) => {
            if (item.kind === 'loan') {
              const moreCount = loans.length > 1 ? loans.length : undefined;
              return <LoanDecisionCard key={`loan-${item.loan.id}`} groupId={groupId} loan={item.loan} onView={() => setViewLoan(item.loan)} onSeeAll={() => go('loans/decisions')} moreCount={moreCount} />;
            }
            if (item.kind === 'member') {
              const moreCount = members.length > 1 ? members.length : undefined;
              return <MembershipDecisionCard key={`member-${item.row.id}`} groupId={groupId} row={item.row} onPress={() => go('members/approvals')} onChanged={onChanged} moreCount={moreCount} />;
            }
            if (item.kind === 'gcash') {
              return <GcashDecisionCard key="gcash-proposal" groupId={groupId} submittedAt={group?.treasurer_gcash_submitted_at ?? null} onPress={() => go('group/settings')} onChanged={onChanged} />;
            }
            if (item.kind === 'signoff') {
              return <SignoffCard key="signoff" groupId={groupId} count={signoffMine.length} first={signoffMine[0]} />;
            }
            const moreCount = penalties.length > 1 ? penalties.length : undefined;
            return <PenaltyDecisionCard key={`penalty-${item.penalty.id}`} groupId={groupId} penalty={item.penalty} onPress={() => go('penalties')} onChanged={onChanged} moreCount={moreCount} />;
          })}
        </View>
      )}

      <LoanDecisionSheet groupId={groupId} loan={viewLoan} onClose={() => setViewLoan(null)} onDecided={onChanged} />
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

const MANAGE_ACTIONS: TileAction[] = [
  { label: 'Manage Officers', icon: Users, route: 'members/officers' },
  { label: 'Group Ledger', icon: ScrollText, route: 'reports/group-ledger' },
  { label: 'Member Balances', icon: Wallet, route: 'reports/member-balances' },
  { label: 'Configure Cycle', icon: SlidersHorizontal, route: 'cycles/configure' },
  { label: 'Year-End Distribution', icon: CalendarClock, route: 'distribution/year-end' },
  { label: 'Audit Trail', icon: Clock3, route: 'audit/log' },
  { label: 'Reports & Export', icon: Download, route: 'reports/export' },
];

/* ---------------- Activity — what officers decided (audit log), not money movements ---------------- */
function RecentActivity({ groupId }: { groupId: string }) {
  const router = useRouter();
  const log = useAuditLog(groupId, { limit: 3 });
  const entries = log.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16, marginTop: 8 }, shadowToken.soft]}>
      {log.loading && entries.length === 0 ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 8 }} />
      ) : entries.length === 0 ? (
        <Text variant="body" color="muted">No activity yet.</Text>
      ) : (
        <AuditTimeline
          entries={entries}
          onOpen={(e) => router.push({ pathname: '/(app)/[groupId]/owner-activity/[id]' as any, params: { groupId, id: e.id, at: e.created_at } })}
        />
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

      <CollectionBlock groupId={groupId} go={go} head={(title, aside) => <SectionHead title={title} aside={aside} />} />

      <ScrollTileRow actions={MANAGE_ACTIONS} go={go} />

      <SectionHead title="Recent activity" aside="See all" onAsidePress={() => go('owner-activity')} />
      <RecentActivity groupId={groupId} />
    </>
  );
}
