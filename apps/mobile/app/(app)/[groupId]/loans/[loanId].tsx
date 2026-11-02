import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, X, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useQuery } from '@/hooks/useApi';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useLoan, useLoans, useLoanEligibility } from '@/features/lending/lending.hooks';
import { useLoanDecision, loanName } from '@/features/lending/LoanDecisionSheet';
import { totalInterest } from '@/features/lending/remainingInterest';
import { getMemberStanding } from '@/api/groups';
import { headLabel } from '@/api/lending';

const ROLE_NAME: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

function longDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionTitle({ children, aside }: { children: string; aside?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 9 }}>
      <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{children}</Text>
      {aside}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 }, shadowToken.soft]}>{children}</View>;
}

function Rows({ rows }: { rows: [string, string, string?][] }) {
  return (
    <Card>
      {rows.map(([label, value, tone], i) => (
        <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
          <Text style={{ fontSize: 13, color: semantic.textSecondary }}>{label}</Text>
          <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: tone ?? semantic.textPrimary }}>{value}</Text>
        </View>
      ))}
    </Card>
  );
}

function Check1({ passed, label, detail }: { passed: boolean; label: string; detail?: string }) {
  const tone = passed ? intent.success : intent.danger;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: passed ? tone.soft : tone.base, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {passed ? <Check size={12} color={tone.text} strokeWidth={3} /> : <X size={12} color="#fff" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{label}</Text>
        {detail ? <Text style={{ fontSize: 11.5, color: passed ? semantic.textSecondary : intent.danger.text, marginTop: 1 }}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/** A loan request in full — opened from the Organizer's Pending actions. Approve / Reject sit at the bottom. */
export default function LoanRequest() {
  const { groupId, loanId } = useLocalSearchParams<{ groupId: string; loanId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, membership } = useActiveGroup();
  const { cycle, loading: cycleLoading } = useActiveCycle(groupId!);
  const q = useLoan(groupId!, loanId);
  const loan = q.data?.loan ?? null;
  const eligibility = useLoanEligibility(groupId!, loan?.status === 'pending' ? loan.id : undefined);
  const allLoans = useLoans(groupId!);
  const standing = useQuery(
    () => (loan ? getMemberStanding(groupId!, loan.membership_id) : Promise.resolve(null)),
    [groupId, loan?.membership_id],
  );
  const decision = useLoanDecision(groupId!, { onDecided: () => router.back() });

  if (!loan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Loan request" onClose={() => router.back()} />
        {q.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40 }}>This loan couldn’t be found.</Text>
        )}
      </SafeAreaView>
    );
  }

  const pending = loan.status === 'pending';
  const own = loan.membership_id === membership?.id;
  // No self-approval: the Organizer decides members' loans, the Treasurer decides the Organizer's.
  const canDecide = pending && !own && (role === 'owner' || (role === 'treasurer' && loan.membership?.role === 'owner'));

  const principal = Number(loan.principal);
  const available = decision.available;
  const short = pending && decision.liquidity.data != null && available < principal;
  // Before approval there's no rate on the loan yet — estimate with this cycle's default, which is what Approve uses.
  // loans.interest_rate is NOT NULL DEFAULT 0 (0005_lending.sql), so a pending loan reads 0% until it's approved.
  // Only trust it once decided; before that, estimate with this cycle's default — the rate Approve applies.
  const decided = !pending && loan.status !== 'rejected' && loan.status !== 'cancelled';
  const cycleRate = cycle?.default_interest_rate != null ? Number(cycle.default_interest_rate) : null;
  const rate = decided ? Number(loan.interest_rate ?? 0) : cycleRate;
  const estPrincipal = loan.approved_principal ? Number(loan.approved_principal) : short && available > 0 ? available : principal;
  // Flat rate on the loan amount every month (same as the request screen and remainingInterest.ts).
  const interest = rate != null ? totalInterest({ principal: String(estPrincipal), approved_principal: null, interest_rate: String(rate), term_months: loan.term_months }) : null;
  const interestPerMonth = interest != null ? Math.round((interest / loan.term_months) * 100) / 100 : null;
  const totalDue = interest != null ? Math.round((estPrincipal + interest) * 100) / 100 : null;
  const perMonth = totalDue != null ? Math.round((totalDue / loan.term_months) * 100) / 100 : null;
  const rateLabel = rate != null
    ? `${+(rate * 100).toFixed(2)}% / month${decided ? '' : ' (cycle rate)'}`
    : cycleLoading ? '…' : 'Not set — configure the cycle';

  const s = standing.data;
  const history = (allLoans.data ?? [])
    .filter((l) => l.membership_id === loan.membership_id && l.id !== loan.id)
    .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime());
  const paidCount = history.filter((l) => l.status === 'paid').length;
  const defaultedCount = history.filter((l) => l.status === 'defaulted').length;
  const openLoans = history.filter((l) => l.status === 'active' || l.status === 'approved');

  const terms: [string, string, string?][] = [
    ['Requested', formatPeso(loan.principal)],
    ...(short ? [['Can approve now', formatPeso(Math.max(0, available)), intent.warning.text] as [string, string, string]] : []),
    ...(loan.approved_principal ? [['Approved amount', formatPeso(loan.approved_principal)] as [string, string]] : []),
    ['Term', `${loan.term_months} month${loan.term_months === 1 ? '' : 's'}`],
    ['Interest rate', rateLabel, rate == null && !cycleLoading ? intent.warning.text : undefined],
    ...(interest != null ? [
      ['Interest per month', formatPeso(interestPerMonth!)] as [string, string],
      [`Total interest (${loan.term_months} mo)`, formatPeso(interest)] as [string, string],
      ['Total to repay', formatPeso(totalDue!)] as [string, string],
      ['Monthly payment', formatPeso(perMonth!)] as [string, string],
    ] : []),
    ['Applied', longDate(loan.applied_at)],
    ...(loan.rejection_reason ? [['Rejection reason', loan.rejection_reason] as [string, string]] : []),
  ];

  const borrower: [string, string, string?][] = [
    ['Role', ROLE_NAME[loan.membership?.role ?? 'member'] ?? 'Member'],
    ['For', loan.head_no > 1 ? headLabel(loan.head_no, loan.head_name) : 'Their own share'],
    ...(loan.membership?.heads ? [['Shares (heads)', String(loan.membership.heads)] as [string, string]] : []),
    ...(s ? [
      ['Contributed this cycle', formatPeso(s.settlement.capital)] as [string, string],
      ['Owes on loans now', formatPeso(s.settlement.loan_owed), s.settlement.loan_owed > 0 ? intent.warning.text : undefined] as [string, string, string?],
      ['Unpaid penalties', formatPeso(s.settlement.penalties), s.settlement.penalties > 0 ? intent.danger.text : undefined] as [string, string, string?],
    ] : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <CloseHeader title="Loan request" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: canDecide ? 120 : 40 }}>
        {/* Who and how much */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={loanName(loan)} uri={loan.membership?.members?.avatar_url} size={48} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{loanName(loan)}</Text>
            <StatusBadge entity="loan" value={loan.status} />
          </View>
        </View>
        <Text style={{ fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8, marginTop: 14 }}>
          {formatPeso(loan.principal)}
        </Text>
        <Text variant="caption" color="secondary">
          {loan.purpose ? `For ${loan.purpose} · ` : ''}{loan.term_months} months · requested {longDate(loan.applied_at)}
        </Text>

        {/* Eligibility */}
        {pending ? (
          <>
            <SectionTitle>Eligibility</SectionTitle>
            <Card>
              {eligibility.loading && !eligibility.data ? (
                <ActivityIndicator color={semantic.brand} style={{ margin: 16 }} />
              ) : (
                <>
                  <Check1
                    passed={!!eligibility.data?.eligible}
                    label={eligibility.data?.eligible ? 'Eligible for approval' : 'Review before approving'}
                    detail={eligibility.data?.eligible ? 'Meets the group’s loan rules' : undefined}
                  />
                  {(eligibility.data?.reasons ?? []).map((r) => (
                    <View key={r} style={{ borderTopWidth: 1, borderColor: semantic.border }}>
                      <Check1 passed={false} label={r} />
                    </View>
                  ))}
                  <View style={{ borderTopWidth: 1, borderColor: semantic.border }}>
                    <Check1
                      passed={!short}
                      label={`Fund cash ${formatPeso(available)}`}
                      detail={short ? `Short by ${formatPeso(principal - available)} — Approve gives what’s available` : 'Enough to cover this loan'}
                    />
                  </View>
                </>
              )}
            </Card>
          </>
        ) : null}

        {/* Terms */}
        <SectionTitle>{pending ? 'If approved' : 'Loan terms'}</SectionTitle>
        <Rows rows={terms} />

        {/* Borrower */}
        <SectionTitle
          aside={role === 'owner' ? (
            <Pressable
              hitSlop={8}
              onPress={() => router.push({ pathname: '/(app)/[groupId]/members/manage/[membershipId]' as any, params: { groupId, membershipId: loan.membership_id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
            >
              <Text variant="caption" style={{ color: semantic.brandDark, fontFamily: 'Poppins_600SemiBold' }}>View member</Text>
              <ChevronRight size={14} color={semantic.brandDark} />
            </Pressable>
          ) : undefined}
        >
          Borrower
        </SectionTitle>
        {standing.loading && !s ? <Card><ActivityIndicator color={semantic.brand} style={{ margin: 16 }} /></Card> : <Rows rows={borrower} />}

        {/* Loan history */}
        <SectionTitle aside={history.length ? (
          <Text variant="caption" color="secondary">
            {[`${paidCount} paid`, openLoans.length ? `${openLoans.length} open` : '', defaultedCount ? `${defaultedCount} defaulted` : ''].filter(Boolean).join(' · ')}
          </Text>
        ) : undefined}>
          Past loans
        </SectionTitle>
        <Card>
          {allLoans.loading && !allLoans.data ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 16 }} />
          ) : history.length === 0 ? (
            <Text variant="body" color="muted" style={{ paddingVertical: 14 }}>First loan request in this group.</Text>
          ) : (
            history.map((l, i) => (
              <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i < history.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{formatPeso(l.approved_principal ?? l.principal)}</Text>
                  <Text style={{ fontSize: 11.5, color: semantic.textSecondary }}>
                    {longDate(l.applied_at)} · {l.term_months} mo{Number(l.outstanding_balance) > 0 && l.status === 'active' ? ` · ${formatPeso(l.outstanding_balance)} left` : ''}
                  </Text>
                </View>
                <StatusBadge entity="loan" value={l.status} />
              </View>
            ))
          )}
        </Card>

        {pending && own ? (
          <Text variant="caption" color="secondary" style={{ marginTop: 16, textAlign: 'center' }}>This is your own loan. The Treasurer decides it.</Text>
        ) : null}
      </ScrollView>

      {canDecide ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4, flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => decision.onRejectPress(loan)}
            disabled={decision.busy}
            style={[{ flex: 1, alignItems: 'center', paddingVertical: 15, borderRadius: 16, backgroundColor: '#F7E5E5' }, shadowToken.soft]}
          >
            <Text variant="label" style={{ color: '#C25C5E' }}>Reject</Text>
          </Pressable>
          <Pressable
            onPress={() => decision.onApprovePress(loan)}
            disabled={decision.busy}
            style={[{ flex: 1, alignItems: 'center', paddingVertical: 15, borderRadius: 16, backgroundColor: semantic.brand, opacity: decision.busy ? 0.6 : 1 }, shadowToken.soft]}
          >
            <Text variant="label" style={{ color: '#fff' }}>{short && available > 0 ? `Approve ${formatPeso(available)}` : 'Approve'}</Text>
          </Pressable>
        </View>
      ) : null}

      {decision.prompt}
    </SafeAreaView>
  );
}
