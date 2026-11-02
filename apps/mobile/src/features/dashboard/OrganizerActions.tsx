import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useAction } from '@/hooks/useApi';
import { CheckCircle2, HandCoins, UserPlus, AlertTriangle, Smartphone, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { SlideSheet } from '@/components/shared/SlideSheet';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { useLoans, useLoanEligibility, useLiquidity } from '@/features/lending/lending.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { totalInterest } from '@/features/lending/remainingInterest';
import { loanName } from '@/features/lending/LoanDecisionSheet';
import { useSignoffQueue, type SignoffItem } from '@/features/signoff/signoff';
import { usePenalties } from '@/features/penalties/penalties.hooks';
import { whenLabel } from '@/features/auditlog/AuditTimeline';
import { QueueRow, SignoffRow } from '@/features/audit/VerificationQueue';
import { listPendingMembers, approveMember, rejectMember, listOfficers } from '@/api/groups';
import type { Loan } from '@/api/lending';
import type { Penalty } from '@/api/penalties';

export function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/* ---------------- Data: everything waiting on the signed-in officer (Organizer or Treasurer) ---------------- */
export type ActionKind = 'loan' | 'member' | 'penalty' | 'gcash' | 'signoff';

/** The filter pills on the Pending actions page. The Treasurer's sign-offs split into payments and releases. */
export type ActionFilter = 'loan' | 'member' | 'penalty' | 'gcash' | 'signoff' | 'payment' | 'release';

export const FILTER_LABEL: Record<ActionFilter, string> = {
  loan: 'Loan requests',
  member: 'Member requests',
  penalty: 'Penalties',
  gcash: 'GCash',
  signoff: 'Sign-offs',
  payment: 'Payments',
  release: 'Releases',
};

export const EMPTY_LABEL: Record<ActionFilter, string> = {
  loan: 'No loan requests',
  member: 'No member requests',
  penalty: 'No penalties to review',
  gcash: 'No GCash proposal',
  signoff: 'No sign-offs',
  payment: 'No payments to confirm',
  release: 'Nothing to release',
};

// Each role's pills in order; `always` show even at zero, the rest only when something's waiting.
const ROLE_FILTERS: Record<'owner' | 'treasurer', { order: ActionFilter[]; always: ActionFilter[] }> = {
  owner: { order: ['loan', 'member', 'penalty', 'signoff', 'gcash'], always: ['loan', 'member'] },
  treasurer: { order: ['payment', 'release', 'loan', 'signoff'], always: ['payment', 'release'] },
};

type PendingMemberRow = { id: string; name: string; email: string | null; avatar: string | null; date: string | null; verification: string | null };
function normalizePendingMember(item: any): PendingMemberRow {
  return {
    // approve/reject take the MEMBER id (members/:memberId/approve), not the
    // membership row's own id — member_id must win here.
    id: item?.member_id ?? item?.members?.id ?? item?.member?.id ?? item?.id,
    name: item?.full_name ?? item?.name ?? item?.members?.full_name ?? item?.member?.full_name ?? 'Member',
    email: item?.email ?? item?.members?.email ?? item?.member?.email ?? null,
    avatar: item?.avatar_url ?? item?.members?.avatar_url ?? item?.member?.avatar_url ?? null,
    date: item?.created_at ?? item?.joined_at ?? null,
    verification: item?.verification_status ?? item?.members?.verification_status ?? item?.member?.verification_status ?? null,
  };
}

export type ActionItem = (
  | { kind: 'loan'; key: string; date: string; loan: Loan }
  | { kind: 'member'; key: string; date: string; row: PendingMemberRow }
  | { kind: 'penalty'; key: string; date: string; penalty: Penalty }
  | { kind: 'gcash'; key: string; date: string }
  | { kind: 'signoff'; key: string; date: string; signoff: SignoffItem }
) & { filter: ActionFilter };

function signoffFilter(s: SignoffItem, isOwner: boolean): ActionFilter {
  if (isOwner) return 'signoff';
  if (s.kind === 'contribution' || s.kind === 'repayment') return 'payment';
  if (s.kind === 'loan' || s.kind === 'withdrawal') return 'release';
  return 'signoff';
}

/**
 * Everything waiting on the signed-in officer, oldest first.
 * Organizer: loan and member requests, penalties, the Treasurer's GCash proposal, their sign-offs.
 * Treasurer: the Organizer's own loan request (no self-approval — the Treasurer decides it) and
 * their sign-offs: payments to confirm, officer loans to review, loans and withdrawals to release.
 */
export function useOfficerActions(groupId: string) {
  const { group, membership, role } = useActiveGroup();
  const isOwner = role === 'owner';
  const { refresh: refreshGroups } = useGroups();
  const pendingLoans = useLoans(groupId, { status: 'pending' });
  const pendingMembersQ = useQuery(
    () => (isOwner ? listPendingMembers(groupId) : Promise.resolve([])),
    [groupId, isOwner],
    { table: 'memberships', filter: `group_id=eq.${groupId}` },
  );
  const pendingPenalties = usePenalties(groupId, 'pending');
  const decidedPenalties = usePenalties(groupId, 'waived');
  const signoff = useSignoffQueue(groupId);

  // No self-approval (lending.routes.js): the Organizer decides everyone's loan but their own,
  // which goes to the Treasurer instead.
  const loans = useMemo(
    () => (pendingLoans.data ?? []).filter((l) => (isOwner ? l.membership_id !== membership?.id : role === 'treasurer' && l.membership?.role === 'owner')),
    [pendingLoans.data, membership?.id, isOwner, role],
  );
  const members = useMemo(() => (Array.isArray(pendingMembersQ.data) ? pendingMembersQ.data : []).map(normalizePendingMember), [pendingMembersQ.data]);
  const penalties = useMemo(() => (isOwner ? pendingPenalties.data ?? [] : []), [pendingPenalties.data, isOwner]);
  const gcashPending = isOwner && group?.treasurer_gcash_status === 'pending';
  const signoffMine = signoff.mine;

  const loading = pendingLoans.loading || pendingMembersQ.loading || (isOwner && pendingPenalties.loading) || (signoff.loading && signoff.items.length === 0);

  const refetch = () => {
    pendingLoans.refetch();
    pendingMembersQ.refetch();
    pendingPenalties.refetch();
    signoff.refetch();
    refreshGroups();
  };

  const items: ActionItem[] = useMemo(() => {
    const list: ActionItem[] = [
      ...loans.map((loan) => ({ kind: 'loan' as const, filter: 'loan' as const, key: `loan-${loan.id}`, date: loan.applied_at, loan })),
      ...members.map((row) => ({ kind: 'member' as const, filter: 'member' as const, key: `member-${row.id}`, date: row.date ?? new Date(0).toISOString(), row })),
      ...penalties.map((penalty) => ({ kind: 'penalty' as const, filter: 'penalty' as const, key: `penalty-${penalty.id}`, date: penalty.created_at, penalty })),
      ...(gcashPending ? [{ kind: 'gcash' as const, filter: 'gcash' as const, key: 'gcash', date: group?.treasurer_gcash_submitted_at ?? new Date(0).toISOString() }] : []),
      ...signoffMine.map((s) => ({ kind: 'signoff' as const, filter: signoffFilter(s, isOwner), key: `signoff-${s.key}`, date: s.since, signoff: s })),
    ];
    return list.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
  }, [loans, members, penalties, gcashPending, group?.treasurer_gcash_submitted_at, signoffMine, isOwner]);

  const counts = useMemo(() => {
    const c = { loan: 0, member: 0, penalty: 0, gcash: 0, signoff: 0, payment: 0, release: 0 } as Record<ActionFilter, number>;
    items.forEach((i) => { c[i.filter] += 1; });
    return c;
  }, [items]);

  const filters = ROLE_FILTERS[role === 'treasurer' ? 'treasurer' : 'owner'];

  return {
    items, counts, total: items.length, loading, refetch, filters,
    decidedCount: isOwner ? decidedPenalties.data?.length ?? 0 : 0,
  };
}

/* ---------------- Rows: same design as the sign-off queue ---------------- */
const brandTone = { soft: semantic.surfaceAlt, text: semantic.brandDark };

/** Shared by every loan row in a list — fetched once, not per row. */
type LoanContext = { rate: number | null; available: number | null; compact?: boolean };

function LoanRow({ groupId, loan, ctx, last, onPress }: { groupId: string; loan: Loan; ctx: LoanContext; last: boolean; onPress: () => void }) {
  const { data: elig } = useLoanEligibility(groupId, ctx.compact ? undefined : loan.id);
  const principal = Number(loan.principal);
  const short = ctx.available != null && ctx.available < principal;
  // Pending loans carry interest_rate 0 until approved, so estimate with the cycle rate — what Approve applies.
  const repay = ctx.rate != null ? totalInterest({ principal: loan.principal, approved_principal: null, interest_rate: String(ctx.rate), term_months: loan.term_months }) + principal : null;
  const pill = !elig ? null
    : !elig.eligible ? { text: elig.reasons[0] ?? 'Not eligible', tone: 'bad' as const }
    : short ? { text: ctx.available! > 0 ? `Fund covers ${formatPeso(ctx.available!)} only` : 'No fund cash right now', tone: 'bad' as const }
    : { text: 'Eligible', tone: 'good' as const };
  return (
    <QueueRow
      Icon={HandCoins}
      tone={intent.danger}
      tag="Loan request"
      title={loanName(loan)}
      lines={[
        `${loan.term_months} month${loan.term_months === 1 ? '' : 's'}${loan.purpose ? ` · ${loan.purpose}` : ''}`,
        repay != null ? `${formatPeso(Math.round((repay / loan.term_months) * 100) / 100)}/mo · ${formatPeso(repay)} total at ${+(ctx.rate! * 100).toFixed(2)}%` : 'No cycle interest rate set',
        whenLabel(loan.applied_at),
      ]}
      pill={pill}
      amount={formatPeso(loan.principal)}
      last={last}
      compact={ctx.compact}
      onPress={onPress}
    />
  );
}

const VERIFICATION_PILL: Record<string, { text: string; tone: 'good' | 'bad' | 'muted' }> = {
  verified: { text: 'ID verified', tone: 'good' },
  pending: { text: 'ID under review', tone: 'muted' },
  unverified: { text: 'ID not verified', tone: 'muted' },
  resubmission_required: { text: 'ID needs resubmission', tone: 'bad' },
  rejected: { text: 'ID rejected', tone: 'bad' },
};

function GcashRow({ groupId, date, last, compact, onPress }: { groupId: string; date: string; last: boolean; compact?: boolean; onPress: () => void }) {
  const { group } = useActiveGroup();
  const officers = useQuery(() => listOfficers(groupId), [groupId]);
  const treasurer = officers.data?.officers.find((o) => o.role === 'treasurer')?.full_name ?? 'The Treasurer';
  const current = group?.treasurer_gcash_number;
  return (
    <QueueRow
      Icon={Smartphone}
      tone={brandTone}
      tag="GCash proposal"
      title={treasurer}
      lines={[
        [group?.treasurer_gcash_pending_name, group?.treasurer_gcash_pending_number].filter(Boolean).join(' · ') || 'New GCash account',
        current ? `Replaces ${current}` : 'First GCash account for the group',
        whenLabel(date),
      ]}
      pill={group?.treasurer_gcash_pending_qr_url ? { text: 'QR code attached', tone: 'good' } : { text: 'No QR code', tone: 'muted' }}
      last={last}
      compact={compact}
      onPress={onPress}
    />
  );
}

function ActionRow({ groupId, item, ctx, last, onOpen }: { groupId: string; item: ActionItem; ctx: LoanContext; last: boolean; onOpen: (item: ActionItem) => void }) {
  const { member } = useAuth();
  const onPress = () => onOpen(item);
  switch (item.kind) {
    case 'loan':
      return <LoanRow groupId={groupId} loan={item.loan} ctx={ctx} last={last} onPress={onPress} />;
    case 'member':
      return (
        <QueueRow
          Icon={UserPlus}
          tone={brandTone}
          tag="Member request"
          title={item.row.name}
          lines={[item.row.email ?? 'Wants to join the group', item.row.date ? `Asked ${whenLabel(item.row.date)}` : '']}
          pill={VERIFICATION_PILL[item.row.verification ?? 'unverified'] ?? null}
          last={last}
          compact={ctx.compact}
          onPress={onPress}
        />
      );
    case 'penalty': {
      const p = item.penalty;
      const own = p.membership?.member_id === member?.id;
      return (
        <QueueRow
          Icon={AlertTriangle}
          tone={intent.warning}
          tag="Penalty review"
          title={p.membership?.members?.full_name ?? 'Member'}
          lines={[p.reason, `Applied ${whenLabel(p.created_at)}`]}
          pill={own ? { text: 'Your own, the Auditor waives it', tone: 'muted' } : p.paid_with_contribution_id ? { text: 'Paid with a contribution', tone: 'good' } : { text: 'Unpaid', tone: 'bad' }}
          amount={formatPeso(p.amount)}
          last={last}
          compact={ctx.compact}
          onPress={onPress}
        />
      );
    }
    case 'gcash':
      return <GcashRow groupId={groupId} date={item.date} last={last} compact={ctx.compact} onPress={onPress} />;
    case 'signoff':
      return <SignoffRow i={item.signoff} last={last} onPress={onPress} />;
  }
}

/* ---------------- Member request: pull-up details with Approve / Reject ---------------- */
function MemberRequestSheet({ groupId, row, onClose, onDecided }: { groupId: string; row: PendingMemberRow | null; onClose: () => void; onDecided: () => void }) {
  const approve = useAction((id: string) => approveMember(groupId, id));
  const reject = useAction(({ id, reason }: { id: string; reason: string }) => rejectMember(groupId, id, reason || undefined));
  const [rejectTarget, setRejectTarget] = useState<PendingMemberRow | null>(null);
  const busy = approve.loading || reject.loading;

  async function onApprove(r: PendingMemberRow) {
    const ok = await approve.run(r.id);
    if (ok !== undefined) { onClose(); onDecided(); }
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }
  async function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const ok = await reject.run({ id: rejectTarget.id, reason });
    setRejectTarget(null);
    if (ok !== undefined) onDecided();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  return (
    <>
      <SlideSheet value={row} onClose={onClose}>
        {(r) => (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Avatar name={r.name} uri={r.avatar} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h2" style={{ fontSize: 17 }}>{r.name}</Text>
                <Text variant="caption" color="secondary">{r.email ?? 'Wants to join'}{r.date ? ` · ${shortDate(r.date)}` : ''}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={{ padding: 2 }}>
                <X size={20} color={semantic.textMuted} />
              </Pressable>
            </View>

            {r.verification ? (
              <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="caption" color="secondary">ID verification</Text>
                <StatusBadge entity="verification" value={r.verification} />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => { onClose(); setRejectTarget(r); }}
                disabled={busy}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#F7E5E5' }}
              >
                <Text variant="label" style={{ color: '#C25C5E' }}>Reject</Text>
              </Pressable>
              <Pressable
                onPress={() => onApprove(r)}
                disabled={busy}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: semantic.brand, opacity: busy ? 0.6 : 1 }}
              >
                <Text variant="label" style={{ color: '#fff' }}>Approve</Text>
              </Pressable>
            </View>
          </>
        )}
      </SlideSheet>

      <ReasonPrompt
        visible={!!rejectTarget}
        title={`Reject ${rejectTarget?.name ?? 'request'}?`}
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejectTarget(null)}
        onConfirm={onRejectConfirm}
      />
    </>
  );
}

/**
 * The action rows in one card. Each opens its own place: a loan request opens
 * its full page, a member request pulls up its details, a penalty opens Penalties, the GCash proposal
 * opens group settings, a sign-off opens that record's verify page.
 */
export function ActionList({ groupId, items, onChanged, footer, compact }: { groupId: string; items: ActionItem[]; onChanged: () => void; footer?: React.ReactNode; compact?: boolean }) {
  const router = useRouter();
  const [viewMember, setViewMember] = useState<PendingMemberRow | null>(null);
  const hasLoans = items.some((i) => i.kind === 'loan');
  const { cycle } = useActiveCycle(groupId);
  const liquidity = useLiquidity(groupId);
  const ctx: LoanContext = {
    rate: cycle?.default_interest_rate != null ? Number(cycle.default_interest_rate) : null,
    available: hasLoans && liquidity.data ? Number(liquidity.data.available_cash) : null,
    compact,
  };
  const go = (pathname: string, params: Record<string, string> = {}) => router.push({ pathname: pathname as any, params: { groupId, ...params } });

  function open(item: ActionItem) {
    switch (item.kind) {
      case 'loan': return go('/(app)/[groupId]/loans/[loanId]', { loanId: item.loan.id });
      case 'member': return setViewMember(item.row);
      case 'penalty': return go('/(app)/[groupId]/penalties');
      case 'gcash': return go('/(app)/[groupId]/group/settings');
      case 'signoff': return go('/(app)/[groupId]/verify/[key]', { key: item.signoff.key });
    }
  }

  return (
    <>
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, overflow: 'hidden' }, shadowToken.soft]}>
        {items.map((item, idx) => (
          <ActionRow key={item.key} groupId={groupId} item={item} ctx={ctx} last={idx === items.length - 1 && !footer} onOpen={open} />
        ))}
        {footer}
      </View>
      <MemberRequestSheet groupId={groupId} row={viewMember} onClose={() => setViewMember(null)} onDecided={onChanged} />
    </>
  );
}

const DASHBOARD_LIMIT = 3;

/** Dashboard card: the oldest few actions, "See more" opens the Pending actions page. `head` draws the dashboard's own section title. */
export function PendingActionsCard({ groupId, head }: { groupId: string; head: (title: string, aside: string | undefined, hot: boolean) => React.ReactNode }) {
  const router = useRouter();
  const { items, total, loading, refetch, decidedCount } = useOfficerActions(groupId);
  // Back from a verify or loan page: drop whatever was decided there.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useFocusEffect(useCallback(() => { refetchRef.current(); }, []));

  return (
    <>
      {head('Pending actions', loading ? undefined : total > 0 ? `${total} waiting` : 'All clear', total > 0)}

      {loading && items.length === 0 ? (
        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 24, alignItems: 'center' }, shadowToken.soft]}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : total === 0 ? (
        <EmptyActions decidedCount={decidedCount} />
      ) : (
        <ActionList
          compact
          groupId={groupId}
          items={items.slice(0, DASHBOARD_LIMIT)}
          onChanged={refetch}
          footer={
            <Pressable onPress={() => router.push({ pathname: '/(app)/[groupId]/actions' as any, params: { groupId } })} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: semantic.border }}>
              <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
                {total > DASHBOARD_LIMIT ? `See more (${total - DASHBOARD_LIMIT} more)` : 'See more'}
              </Text>
            </Pressable>
          }
        />
      )}
    </>
  );
}

export function EmptyActions({ decidedCount, label = 'Nothing waiting on you' }: { decidedCount: number; label?: string }) {
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, shadowToken.soft]}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={18} color={intent.success.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{label}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {decidedCount > 0 ? `${decidedCount} decision${decidedCount === 1 ? '' : 's'} made this cycle` : 'New requests will show up here'}
        </Text>
      </View>
    </View>
  );
}
