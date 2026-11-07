import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Image, Modal } from 'react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Receipt, FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { PillFilters } from '@/components/shared/PillFilters';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { headLabel, type Loan, type LoanPayment } from '@/api/lending';
import { useLoans, useRepayments, useConfirmRepaymentReceipt, useRejectRepayment } from '@/features/lending/lending.hooks';
import { remainingInterest } from '@/features/lending/remainingInterest';
import { loanSchedule, loanPenaltyOwed, monthKeyOf, dateOfMonthKey, type Installment } from '@/features/lending/loanSchedule';
import { PeriodSwitcher } from '@/features/contributions/PeriodSwitcher';

type Tab = 'pending' | 'record' | 'awaiting' | 'returned';

function loanName(l: Loan): string {
  const name = l.membership?.members?.full_name ?? 'Member';
  // One loan per head — say which head when it isn't the member's own.
  return l.head_no > 1 ? `${name} · ${headLabel(l.head_no, l.head_name)}` : name;
}
function repaymentName(p: LoanPayment): string {
  return p.loans?.membership?.members?.full_name ?? 'Member';
}
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Tag({ label, tone }: { label: string; tone: 'review' | 'posted' | 'settle' | 'late' }) {
  const map = { review: intent.warning, posted: intent.success, settle: intent.info, late: intent.danger } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

/** One loan in the month view: who, which installment, its amount, and how far the loan is paid off. */
function LoanMonthRow({ loan: l, inst, tag, onPress }: { loan: Loan; inst: Installment; tag: React.ReactNode; onPress: () => void }) {
  const outstanding = Number(l.outstanding_balance ?? 0);
  // TC-040: progress is against approved_principal (what was disbursed), not the requested amount.
  const principal = Number(l.approved_principal ?? l.principal ?? 0);
  const pct = principal ? Math.max(0, Math.min(100, Math.round((1 - outstanding / principal) * 100))) : 0;
  const unpaid = inst.kind === 'late' || inst.kind === 'due' || inst.kind === 'upcoming';
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', gap: 12, padding: 13, borderBottomWidth: 1, borderColor: semantic.border }}>
      <Avatar name={loanName(l)} uri={l.membership?.members?.avatar_url} size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="label" style={{ fontSize: 13.5, flex: 1 }} numberOfLines={1}>{loanName(l)}</Text>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(inst.amount + (unpaid ? inst.penalty : 0))}</Text>
        </View>
        {unpaid && inst.penalty > 0 ? (
          <Text style={{ fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_500Medium', color: intent.danger.text, marginTop: 2 }}>
            {formatPeso(inst.amount)} + {formatPeso(inst.penalty)} penalty · {inst.monthsLate} month{inst.monthsLate === 1 ? '' : 's'} late
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <Text variant="caption" color="secondary">Month {inst.no} of {l.term_months} · {formatPeso(outstanding)} left</Text>
          {tag}
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: semantic.surfaceAlt, overflow: 'hidden', marginTop: 8 }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: intent.success.base, borderRadius: 3 }} />
        </View>
      </View>
    </Pressable>
  );
}

export default function RecordRepayment() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');

  const loans = useLoans(groupId!, {});
  const repayments = useRepayments(groupId!);
  const confirmAction = useConfirmRepaymentReceipt(groupId!);
  const rejectAction = useRejectRepayment(groupId!);
  const allLoans = loans.data ?? [];
  const activeLoans = allLoans.filter((l) => l.status === 'active' || l.status === 'approved');
  const settledLoans = allLoans.filter((l) => l.status === 'paid');
  const loansById = useMemo(() => new Map(allLoans.map((l) => [l.id, l])), [allLoans]);

  const rows = repayments.data ?? [];
  // Split purely on "did I record this," not is_walk_in — a Treasurer's own
  // GENUINE self-submission (is_walk_in: false, since they really are the
  // borrower) used to only get excluded from "Pending" when it was a
  // walk-in they recorded for someone else, so their own repayment claim
  // sat in their own Pending queue with no way for them to confirm it.
  // Since the two-step flow (migration 0075): confirming here only moves a
  // repayment to "Pending verification"; the Auditor's verification posts it.
  // Repayments on my own loan are confirmed by the Organizer, not me.
  const pendingRows = rows.filter((p) => p.status === 'submitted' && p.recorded_by !== member?.id && p.loans?.membership?.member_id !== member?.id);
  const awaitingRows = rows.filter((p) => p.status === 'confirmed' || (p.status === 'submitted' && (p.recorded_by === member?.id || p.loans?.membership?.member_id === member?.id)));
  const returnedRows = rows.filter((p) => p.status === 'rejected' && p.recorded_by === member?.id);

  // Per-loan status tag for the "Record new" list — is there already a claim
  // in flight for this loan, and whose court is it in?
  const pendingByLoan = useMemo(() => new Map(pendingRows.map((p) => [p.loans?.id, p])), [pendingRows]);
  const awaitingByLoan = useMemo(() => new Map(awaitingRows.map((p) => [p.loans?.id, p])), [awaitingRows]);

  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.outstanding_balance), 0);
  const totalInterestEarned = rows.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.interest_portion || 0), 0);
  const postedCount = rows.filter((p) => p.status === 'paid').length;

  // ---- Month switcher over the loans' payment terms (like Contributions) ----
  // Each released loan's installments by calendar month. An unpaid month never
  // drops off: it stays "Late" in its own month, and once a loan's term is over
  // with months still unpaid, it's carried into the current month as "Overdue".
  const schedules = useMemo(
    () => activeLoans.map((l) => ({ loan: l, items: loanSchedule(l, rows) })).filter((x) => x.items.length > 0),
    [activeLoans, rows],
  );
  const nowKey = monthKeyOf(new Date());
  const monthRange = useMemo(() => {
    if (!schedules.length) return null;
    const keys = schedules.flatMap((x) => x.items.map((i) => i.monthKey));
    return { first: Math.min(...keys, nowKey), last: Math.max(...keys, nowKey) };
  }, [schedules, nowKey]);
  const [pickedKey, setPickedKey] = useState<number | null>(null);
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);
  const shownKey = pickedKey ?? nowKey;
  const isPastMonth = shownKey < nowKey;
  const isFutureMonth = shownKey > nowKey;
  const monthName = dateOfMonthKey(shownKey).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  function showMonth(next: number) {
    if (next === shownKey) return;
    setSlide(next > shownKey ? 'right' : 'left');
    setPickedKey(next === nowKey ? null : next);
  }
  const slideIn = slide === 'right' ? FadeInRight.duration(240) : slide === 'left' ? FadeInLeft.duration(240) : undefined;

  type MonthRow = { loan: Loan; inst: Installment; overdue: boolean };
  const monthRows = useMemo<MonthRow[]>(() => {
    const out: MonthRow[] = [];
    for (const { loan, items } of schedules) {
      const inst = items.find((i) => i.monthKey === shownKey);
      if (inst) { out.push({ loan, inst, overdue: false }); continue; }
      // Term already over but something's still unpaid: keep it in front of the Treasurer.
      const firstLate = items.find((i) => i.kind === 'late');
      if (shownKey === nowKey && firstLate && items[items.length - 1].monthKey < nowKey) out.push({ loan, inst: firstLate, overdue: true });
    }
    return out;
  }, [schedules, shownKey, nowKey]);
  const unpaidRows = monthRows.filter((r) => r.inst.kind === 'late' || r.inst.kind === 'due' || r.inst.kind === 'upcoming');
  const handledRows = monthRows.filter((r) => r.inst.kind === 'paid' || r.inst.kind === 'review');
  const monthExpected = monthRows.filter((r) => !r.overdue).reduce((s, r) => s + r.inst.amount, 0);
  // Late penalty still owed on the loans shown this month — shown on the summary card.
  const monthPenalty = monthRows.reduce((s, r) => s + (r.inst.kind === 'late' ? r.inst.penalty : 0), 0);
  const monthPaid = monthRows.filter((r) => !r.overdue && r.inst.kind === 'paid').reduce((s, r) => s + r.inst.amount, 0);

  function goToRecordScreen(l: Loan) {
    router.push({ pathname: '/(app)/[groupId]/loans/record' as any, params: { groupId, loanId: l.id } });
  }

  async function onConfirm(p: LoanPayment) {
    const ok = await confirmAction.run(p.id);
    if (ok !== undefined) { repayments.refetch(); toast('Confirmed — waiting for the Auditor’s verification'); }
    else if (confirmAction.error) Alert.alert('Could not confirm', confirmAction.error.message);
  }

  const [rejectTarget, setRejectTarget] = useState<LoanPayment | null>(null);
  async function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    const ok = await rejectAction.run(id, reason || undefined);
    if (ok !== undefined) { repayments.refetch(); toast('Returned to the borrower'); }
    else if (rejectAction.error) Alert.alert('Could not return', rejectAction.error.message);
  }

  const [viewProof, setViewProof] = useState<LoanPayment | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Loan repayments" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Summary ---------------- */}
        <View style={{ paddingHorizontal: 2, marginBottom: 16 }}>
          <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Owed back by members</Text>
          {loans.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, letterSpacing: -1, marginTop: 4 }}>{formatPeso(totalOutstanding)}</Text>
          )}
          <Text variant="body" color="secondary" style={{ marginTop: 6, fontSize: 12.5 }}>
            {activeLoans.length} active loan{activeLoans.length === 1 ? '' : 's'} · {postedCount} repayment{postedCount === 1 ? '' : 's'} posted
          </Text>
          <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
            <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>Interest earned</Text>
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: intent.success.text, marginTop: 3 }}>{formatPeso(totalInterestEarned)}</Text>
          </View>
        </View>

        {monthRange ? (
          <PeriodSwitcher
            label={monthName}
            isPast={shownKey !== nowKey}
            onPrev={() => showMonth(shownKey - 1)}
            onNext={() => showMonth(shownKey + 1)}
            onReset={() => showMonth(nowKey)}
            prevBlocked={shownKey <= monthRange.first ? 'No loan payments fall before this month.' : null}
            nextBlocked={shownKey >= monthRange.last ? 'This is the last month of the loan terms.' : null}
          />
        ) : null}

        <PillFilters<Tab>
          options={[
            { key: 'pending', label: 'Pending', count: pendingRows.length },
            { key: 'record', label: 'Record new' },
            { key: 'awaiting', label: 'Awaiting', count: awaitingRows.length },
            { key: 'returned', label: 'Returned', count: returnedRows.length, hot: returnedRows.length > 0 },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* ================= PENDING ================= */}
        {tab === 'pending' && (
          repayments.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
          pendingRows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text variant="h3" style={{ fontSize: 16 }}>All confirmed</Text>
              <Text variant="body" color="secondary">No repayment claims waiting.</Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 16 }}>
              {pendingRows.map((p) => {
                const loan = p.loans?.id ? loansById.get(p.loans.id) : undefined;
                const outstanding = Number(loan?.outstanding_balance ?? 0);
                const rate = Number(loan?.interest_rate ?? 0);
                const amt = Number(p.amount);
                // Flat rate, split like one monthly installment — same rule as confirm_loan_repayment (migration 0063).
                const loanAmount = Number(loan?.approved_principal ?? loan?.principal ?? 0);
                const monthInterest = Math.round(loanAmount * rate * 100) / 100;
                const monthly = loan?.term_months ? loanAmount / loan.term_months + monthInterest : 0;
                const interestLeft = loan ? remainingInterest(loan, (repayments.data ?? []).filter((r) => r.loan_id === loan.id)) : 0;
                // Late penalty is taken first (migration 0077).
                const penalty = loan ? Math.min(loanPenaltyOwed(loan, repayments.data ?? []), amt) : 0;
                const rest = amt - penalty;
                const interest = monthly > 0 && rest > 0 ? Math.min(Math.round((rest * monthInterest / monthly) * 100) / 100, interestLeft, rest) : 0;
                const principal = Math.max(Math.min(rest - interest, outstanding), 0);
                const balanceAfter = Math.max(outstanding - principal, 0);
                const settles = balanceAfter <= 0.01;
                return (
                  <View key={p.id} style={[{ backgroundColor: semantic.card, borderRadius: 18, overflow: 'hidden' }, shadowToken.soft, settles ? { borderLeftWidth: 4, borderLeftColor: intent.success.base } : undefined]}>
                    {settles ? (
                      <View style={{ backgroundColor: intent.success.soft, padding: 12, paddingBottom: 10 }}>
                        <Text variant="label" style={{ fontSize: 12, color: intent.success.text }}>This settles the loan</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 15 }}>After this payment {repaymentName(p)} owes nothing — the loan closes and they become eligible to borrow again.</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 0 }}>
                      <Avatar name={repaymentName(p)} uri={p.loans?.membership?.members?.avatar_url} size={44} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={2}>{repaymentName(p)}</Text>
                        <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, marginTop: 2 }}>{formatPeso(p.amount)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>Submitted {timeAgo(p.created_at)}</Text>
                      </View>
                    </View>

                    {loan ? (
                      <View style={{ margin: 14, marginBottom: 0, backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12 }}>
                        <Text variant="overline" color="muted" style={{ marginBottom: 6 }}>How this will be applied</Text>
                        {penalty > 0 ? (
                          <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                            <Text variant="caption" color="secondary">Late penalty</Text>
                            <Text style={{ marginLeft: 'auto', fontFamily: 'Poppins_700Bold', fontSize: 12.5, color: intent.danger.text }}>{formatPeso(penalty)}</Text>
                          </View>
                        ) : null}
                        <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                          <Text variant="caption" color="secondary">Interest</Text>
                          <Text style={{ marginLeft: 'auto', fontFamily: 'Poppins_700Bold', fontSize: 12.5, color: intent.warning.text }}>{formatPeso(interest)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                          <Text variant="caption" color="secondary">Principal</Text>
                          <Text style={{ marginLeft: 'auto', fontFamily: 'Poppins_700Bold', fontSize: 12.5, color: semantic.brandDark }}>{formatPeso(principal)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', paddingVertical: 4, marginTop: 4, borderTopWidth: 1, borderColor: semantic.border }}>
                          <Text variant="label" style={{ fontSize: 12.5 }}>Balance after</Text>
                          <Text style={{ marginLeft: 'auto', fontFamily: 'Poppins_700Bold', fontSize: 14, color: settles ? intent.success.text : semantic.dashCard }}>{settles ? `${formatPeso(0)} · settled` : formatPeso(balanceAfter)}</Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
                      {p.proof_signed_url ? (
                        <Pressable onPress={() => setViewProof(p)} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={16} color={semantic.brandDark} />
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => setRejectTarget(p)} disabled={rejectAction.loading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, borderColor: semantic.borderStrong }}>
                        <Text variant="label" style={{ fontSize: 13, color: semantic.textSecondary }}>Return</Text>
                      </Pressable>
                      <Pressable onPress={() => onConfirm(p)} disabled={confirmAction.loading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 11, backgroundColor: settles ? intent.success.base : semantic.brandDark }}>
                        <Text variant="label" style={{ fontSize: 13, color: '#fff' }}>{settles ? 'Record & settle' : 'Record'}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        )}

        {/* ================= RECORD NEW ================= */}
        {tab === 'record' && (
          <View style={{ marginTop: 16, gap: 16 }}>
            {loans.loading ? <ActivityIndicator color={semantic.brand} /> : activeLoans.length === 0 ? (
              <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>No active loans right now.</Text>
            ) : (
              <Animated.View key={`month-${shownKey}`} entering={slideIn} style={{ gap: 16 }}>
                {monthRows.some((r) => !r.overdue) ? (
                  <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 16, padding: 14 }}>
                    <Text variant="overline" color="muted">{isFutureMonth ? 'Paid in advance' : isPastMonth ? 'Collected' : 'Collected this month'}</Text>
                    <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.4, marginTop: 4 }}>
                      {formatPeso(monthPaid)} <Text style={{ fontSize: 13, color: semantic.textMuted, fontFamily: 'Poppins_500Medium' }}>of {formatPeso(monthExpected)}</Text>
                    </Text>
                    {monthPenalty > 0 ? (
                      <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text, marginTop: 4 }}>+ {formatPeso(monthPenalty)} late penalties</Text>
                    ) : null}
                  </View>
                ) : null}

                {unpaidRows.length > 0 ? (
                  <View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>
                      {isPastMonth || isFutureMonth ? `Not paid for ${monthName}` : 'Not paid this month'}
                    </Text>
                    <View style={[{ backgroundColor: semantic.card, borderRadius: 16, overflow: 'hidden' }, shadowToken.soft]}>
                      {unpaidRows.map(({ loan: l, inst, overdue }) => (
                        <LoanMonthRow
                          key={l.id} loan={l} inst={inst} onPress={() => goToRecordScreen(l)}
                          tag={
                            pendingByLoan.get(l.id) ? <Tag label="Awaiting your review" tone="review" />
                            : awaitingByLoan.get(l.id) ? <Tag label={awaitingByLoan.get(l.id)!.status === 'confirmed' ? 'Pending verification' : 'Awaiting the Organizer'} tone="settle" />
                            : overdue ? <Tag label="Overdue" tone="late" />
                            : inst.kind === 'late' ? <Tag label="Late" tone="late" />
                            : inst.kind === 'upcoming' ? <Tag label="Advance" tone="settle" />
                            : <Tag label="Due" tone="settle" />
                          }
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {handledRows.length > 0 ? (
                  <View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Already handled</Text>
                    <View style={[{ backgroundColor: semantic.card, borderRadius: 16, overflow: 'hidden' }, shadowToken.soft]}>
                      {handledRows.map(({ loan: l, inst }) => (
                        <LoanMonthRow
                          key={l.id} loan={l} inst={inst} onPress={() => goToRecordScreen(l)}
                          tag={inst.kind === 'review' ? <Tag label="Awaiting review" tone="review" /> : <Tag label={isFutureMonth ? 'Paid in advance' : 'Posted'} tone="posted" />}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {monthRows.length === 0 ? (
                  <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>No loan payments fall in {monthName}.</Text>
                ) : null}
              </Animated.View>
            )}

            {settledLoans.length > 0 ? (
              <View>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Settled</Text>
                <View style={[{ backgroundColor: semantic.card, borderRadius: 16, overflow: 'hidden' }, shadowToken.soft]}>
                  {settledLoans.map((l, i) => (
                    <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < settledLoans.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <Avatar name={loanName(l)} uri={l.membership?.members?.avatar_url} size={38} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{loanName(l)}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <Text variant="caption" color="secondary">{formatPeso(l.principal)} original</Text>
                          <Tag label="Settled" tone="posted" />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2 }}>
              A member with an unpaid loan can&apos;t take another one. Settling a loan makes them eligible again straight away.
            </Text>
          </View>
        )}

        {/* ================= AWAITING CONFIRMATION ================= */}
        {tab === 'awaiting' && (
          <View style={{ marginTop: 16 }}>
            {repayments.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            awaitingRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing waiting</Text>
                <Text variant="body" color="secondary">Walk-ins you record show up here until another officer confirms them.</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: intent.info.soft, borderRadius: 16, overflow: 'hidden' }}>
                {awaitingRows.map((p, i) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < awaitingRows.length - 1 ? 1 : 0, borderColor: 'rgba(44,110,155,0.13)' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(44,110,155,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: intent.info.text }}>₱</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: intent.info.text }} numberOfLines={2}>{repaymentName(p)}</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.info.text, marginTop: 1 }}>{formatPeso(p.amount)}</Text>
                      <Text variant="caption" style={{ marginTop: 1, color: intent.info.text, opacity: 0.75 }}>
                        {p.status === 'confirmed' ? `Waiting for verification · ${timeAgo(p.confirmed_at ?? p.created_at)}` : `Waiting for the Organizer · ${timeAgo(p.created_at)}`}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ================= RETURNED ================= */}
        {tab === 'returned' && (
          <View style={{ marginTop: 16 }}>
            {repayments.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            returnedRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing returned</Text>
                <Text variant="body" color="secondary">Anything you recorded that gets sent back shows up here.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {returnedRows.map((p) => (
                  <View key={p.id} style={[{ backgroundColor: semantic.card, borderRadius: 16, overflow: 'hidden', borderLeftWidth: 4, borderLeftColor: intent.danger.base }, shadowToken.soft]}>
                    {p.rejection_reason ? (
                      <View style={{ backgroundColor: intent.danger.soft, padding: 12, paddingBottom: 10 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.danger.text, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>Returned {shortDate(p.updated_at)}</Text>
                        <Text style={{ fontSize: 12, lineHeight: 17, color: '#8E3227', fontFamily: 'Poppins_500Medium' }}>{p.rejection_reason}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, padding: 13 }}>
                      <Avatar name={repaymentName(p)} uri={p.loans?.membership?.members?.avatar_url} size={40} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={2}>{repaymentName(p)}</Text>
                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textMuted, marginTop: 1 }}>{formatPeso(p.amount)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>
                          {p.is_walk_in ? 'Fix it and record it again from Record new' : 'Waiting on the member to resubmit'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
                <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2 }}>
                  Nothing was posted, so there&apos;s nothing to reverse — just correct it and send it through again.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Proof viewer */}
      <Modal visible={!!viewProof} transparent animationType="fade" onRequestClose={() => setViewProof(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewProof(null)}>
          <View style={{ width: '100%', backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text variant="label">{viewProof ? repaymentName(viewProof) : ''}</Text>
                <Text variant="caption" color="secondary">{formatPeso(viewProof?.amount)}</Text>
              </View>
              <Pressable onPress={() => setViewProof(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {viewProof?.proof_signed_url ? (
              <Image source={{ uri: viewProof.proof_signed_url }} style={{ width: '100%', height: 360 }} resizeMode="contain" />
            ) : (
              <View style={{ height: 200, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={36} color={semantic.brand} />
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      <ReasonPrompt
        visible={!!rejectTarget}
        title={rejectTarget ? `Return ${repaymentName(rejectTarget)}'s repayment?` : 'Return repayment'}
        placeholder="What needs to be fixed? (visible to the member)"
        confirmLabel="Return"
        destructive
        required
        onCancel={() => setRejectTarget(null)}
        onConfirm={onRejectConfirm}
      />
    </SafeAreaView>
  );
}
