import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Clock3, Repeat, ChevronRight, ListChecks } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useLoans, useLoan, useCancelLoan } from '@/features/lending/lending.hooks';
import { Badge } from '@/features/lending/LoanBits';
import { remainingInterest } from '@/features/lending/remainingInterest';
import type { LoanPayment } from '@/api/lending';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type PageState = 'active' | 'pending' | 'release';

function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function Tracker({ steps }: { steps: { title: string; sub: string; done: boolean; now?: boolean }[] }) {
  return (
    <View style={{ gap: 4 }}>
      {steps.map((s, i) => (
        <View key={s.title} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ alignItems: 'center', width: 24 }}>
            <View style={{
              width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
              backgroundColor: s.done ? intent.success.base : s.now ? intent.info.base : semantic.surfaceAlt,
            }}>
              {s.done ? <Check size={11} color="#fff" strokeWidth={3} /> : (
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: s.now ? '#fff' : semantic.textMuted }}>{i + 1}</Text>
              )}
            </View>
            {i < steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: s.done ? intent.success.base : semantic.border, marginTop: 2 }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 16 }}>
            <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: s.now ? intent.info.text : s.done ? semantic.textPrimary : semantic.textMuted }}>{s.title}</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 16 }}>{s.sub}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PaymentRow({ p, onPress, last }: { p: LoanPayment; onPress: () => void; last: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(p.amount)}</Text>
          <StatusBadge entity="loanPayment" value={p.status} />
        </View>
        <Text variant="caption" color="secondary">
          {p.status === 'paid' || p.status === 'approved'
            ? `Principal ${formatPeso(p.principal_portion)} · Interest ${formatPeso(p.interest_portion)}`
            : `Sent ${shortDate(p.created_at)}`}
        </Text>
      </View>
      <ChevronRight size={16} color={semantic.textMuted} />
    </Pressable>
  );
}


/**
 * One of my loans — opened from the Loans hub (loans/index.tsx) with its
 * `loanId`. Without one it falls back to the old single-loan behaviour
 * (active, else pending, else approved).
 */
export default function MyLoan() {
  const { groupId, loanId } = useLocalSearchParams<{ groupId: string; loanId?: string }>();
  const router = useRouter();
  const { membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const allLoans = useLoans(groupId!, {});
  const cancel = useCancelLoan(groupId!);

  // listLoans only self-scopes server-side when role === 'member' — for
  // owner/treasurer/auditor it returns the whole group's loans, so filter here
  // to guarantee this page only ever shows the caller's own loans.
  const rows = (allLoans.data ?? []).filter((l) => l.membership_id === membership?.id);
  // Narrowed to the one loan the hub opened, so everything below works as before.
  const pool = loanId ? rows.filter((l) => l.id === loanId) : rows;
  const activeLoan = pool.find((l) => l.status === 'active') ?? null;
  const pendingLoan = pool.find((l) => l.status === 'pending') ?? null;
  const approvedLoan = pool.find((l) => l.status === 'approved') ?? null;
  const currentLoan = activeLoan ?? pendingLoan ?? approvedLoan;

  const detail = useLoan(groupId!, currentLoan?.id);
  const payments = detail.data?.payments ?? [];

  const state: PageState | null =
    activeLoan ? 'active' :
    pendingLoan ? 'pending' :
    approvedLoan ? 'release' : null;

  // "Never loaded yet", not `.loading`: a background or realtime refetch keeps the previous data, and swapping the
  // whole page for the spinner (with a different header) on every one of those made the title flicker.
  const loading =
    (allLoans.data === null && !allLoans.error) ||
    (!!currentLoan && detail.data === null && !detail.error);

  const go = (route: string, extraParams?: Record<string, string>) =>
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId, ...extraParams } });

  async function onCancel() {
    if (!pendingLoan) return;
    Alert.alert('Cancel this request?', 'This withdraws your loan request. You can request again any time.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request', style: 'destructive', onPress: async () => {
          const ok = await cancel.run(pendingLoan.id);
          if (ok === undefined && cancel.error) Alert.alert('Could not cancel', cancel.error.message);
        },
      },
    ]);
  }

  const TITLES: Record<PageState, string> = {
    active: 'My loan',
    pending: 'My loan request',
    release: 'My loan request',
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
        <BandHeader title="" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  // Eligibility, requesting and past loans all live on the Loans hub now —
  // this page is only one loan in progress.
  if (!state) return <Redirect href={{ pathname: '/(app)/[groupId]/loans', params: { groupId } } as any} />;

  // The cycle can configure a default monthly rate (set at cycle creation,
  // cycles/configure.tsx) — the Owner can still adjust it per loan at
  // approval (see api/cycles.ts's own comment on default_interest_rate),
  // but it's real, already-entered data, so pending/eligible members should
  // see an actual estimate sourced from it instead of a vague "once the
  // Owner sets a rate" placeholder.
  const hasCycleRate = cycle?.default_interest_rate != null;
  const cycleRatePct = hasCycleRate ? Number(cycle!.default_interest_rate) * 100 : null;

  // TC-040 lets a loan be approved for LESS than requested when fund cash is
  // short — outstanding_balance is initialized to that approved/disbursed
  // amount (disburse_loan SQL), not the original request. Using the raw
  // `principal` (what was requested) as the "repaid" baseline instead of
  // what was actually lent inflates "repaid"/% complete by the undisbursed
  // difference — e.g. a ₱10,000 request partially approved at ₱6,000, with
  // ₱1,820 actually repaid, showed as "₱5,820 repaid (58%)" instead of the
  // real ₱1,820 (30%).
  const principal = Number(activeLoan?.approved_principal ?? activeLoan?.principal ?? 0);
  const outstanding = Number(activeLoan?.outstanding_balance ?? 0);
  const interestLeft = remainingInterest(activeLoan, payments);
  // A repayment waiting on an officer blocks the next one until it's settled.
  const underReview = payments.some((p) => p.status === 'submitted');
  const repaidAmount = Math.max(0, principal - outstanding);
  const repaidPct = principal > 0 ? Math.min(100, Math.round((repaidAmount / principal) * 100)) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title={TITLES[state]} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {currentLoan ? (
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4, marginBottom: 6 }}>
            Borrower: <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>
              {currentLoan.head_no === 1 ? 'You' : currentLoan.head_name ?? `Head ${currentLoan.head_no}`}
            </Text>
            {currentLoan.head_no > 1 ? ` · Head ${currentLoan.head_no}` : ''}
          </Text>
        ) : null}

        {/* ---------------- Active loan ---------------- */}
        {state === 'active' && activeLoan && (
          <>
            <View style={{ paddingHorizontal: 4, paddingTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Still to repay</Text>
                <Badge tone="primary" label="Active" Icon={Repeat} />
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(outstanding + interestLeft)}</Text>
              <View style={{ marginTop: 15 }}>
                <View style={{ height: 9, borderRadius: 5, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: (repaidPct + '%') as any, borderRadius: 5, backgroundColor: intent.success.base }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text variant="caption" color="secondary">Repaid <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{formatPeso(repaidAmount)}</Text> of {formatPeso(principal)}</Text>
                  <Text variant="caption" style={{ fontWeight: '700', color: semantic.textPrimary }}>{repaidPct}%</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                {[
                  shortDate(activeLoan.disbursed_at ?? activeLoan.applied_at),
                  `${activeLoan.term_months} month${activeLoan.term_months === 1 ? '' : 's'}`,
                  activeLoan.interest_rate ? `${+(Number(activeLoan.interest_rate) * 100).toFixed(2)}% / mo` : '',
                ].filter(Boolean).map((chip) => (
                  <View key={chip} style={{ backgroundColor: semantic.surfaceAlt, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>{chip}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Expected monthly payment — same flat-rate convention as the
                request page (interest = principal × rate each month, not a
                declining balance), split out over the loan's term so "how
                much do I owe every month" has an actual answer instead of
                just a lump "principal left" figure. */}
            {activeLoan.term_months && activeLoan.interest_rate ? (() => {
              const rate = Number(activeLoan.interest_rate);
              const months = activeLoan.term_months;
              const monthlyPrincipal = principal / months;
              const monthlyInterest = principal * rate;
              return (
                <>
                  <SectionHead title="Expected monthly payment" />
                  <View style={[{ backgroundColor: semantic.card, borderRadius: 18, overflow: 'hidden' }, shadowToken.soft]}>
                    {[
                      ['Principal / month', formatPeso(monthlyPrincipal)],
                      ['Interest / month', formatPeso(monthlyInterest)],
                      ['Total / month', formatPeso(monthlyPrincipal + monthlyInterest)],
                    ].map(([k, v], i, a) => (
                      <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: i < a.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                        <Text variant="body" color="secondary">{k}</Text>
                        <Text variant="label">{v}</Text>
                      </View>
                    ))}
                  </View>
                </>
              );
            })() : null}

            {underReview ? (
              <Button label="View my repayments" leading={<ListChecks size={16} color="#fff" />} onPress={() => go('loans/repayments', { from: 'loans' })} style={{ marginTop: 14 }} />
            ) : (
              <Button label="Make a repayment" leading={<Repeat size={16} color="#fff" />} onPress={() => go('loans/repay', { loanId: activeLoan.id })} style={{ marginTop: 14 }} />
            )}

            <SectionHead title="Repayment history" aside={`${payments.length} made`} />
            {payments.length === 0 ? (
              <Text variant="body" color="muted" style={{ paddingVertical: 8, paddingHorizontal: 4 }}>No repayments recorded yet.</Text>
            ) : (
              <View>
                {payments.map((p, i) => <PaymentRow key={p.id} p={p} last={i === payments.length - 1} onPress={() => go('loans/repayments/[paymentId]', { paymentId: p.id })} />)}
              </View>
            )}
          </>
        )}

        {/* ---------------- Awaiting decision ---------------- */}
        {state === 'pending' && pendingLoan && (
          <>
            <View style={{ paddingHorizontal: 4, paddingTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Requested</Text>
                <Badge tone="info" label="With the Organizer" Icon={Clock3} />
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(pendingLoan.principal)}</Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                Submitted <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(pendingLoan.applied_at)}</Text> · {pendingLoan.term_months} month{pendingLoan.term_months === 1 ? '' : 's'}{pendingLoan.purpose ? ` · ${pendingLoan.purpose}` : ''}
              </Text>
            </View>

            <SectionHead title="Progress" aside="Step 2 of 4" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
              <Tracker steps={[
                { title: 'You sent the request', sub: shortDate(pendingLoan.applied_at), done: true },
                { title: 'Organizer is deciding', sub: 'Reviews the amount against your record and the fund’s cash', done: false, now: true },
                { title: 'Treasurer releases the money', sub: 'Sent outside the app, with a reference number', done: false },
                { title: 'Repayments begin', sub: 'Whenever you’re ready, once released', done: false },
              ]} />
            </View>

            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, marginTop: 15 }, CARD_SHADOW]}>
              <Text variant="body" color="secondary" style={{ fontSize: 12.5, lineHeight: 18 }}>
                Estimated principal per month: <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{formatPeso(Number(pendingLoan.principal) / pendingLoan.term_months)}</Text>
                {hasCycleRate
                  ? <> — interest estimated at this cycle's <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{cycleRatePct!.toFixed(2)}%</Text> monthly rate, confirmed by the Organizer at approval.</>
                  : ' — interest is added once the Organizer sets the rate.'}
              </Text>
            </View>

            <Button
              label="Cancel this request" variant="ghost"
              onPress={onCancel} loading={cancel.loading}
              style={{ marginTop: 18 }}
            />
          </>
        )}

        {/* ---------------- Awaiting release ---------------- */}
        {state === 'release' && approvedLoan && (
          <>
            <View style={{ paddingHorizontal: 4, paddingTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Approved</Text>
                <Badge tone="neutral" label="Awaiting release" Icon={Check} />
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(approvedLoan.approved_principal ?? approvedLoan.principal)}</Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                Approved by <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{approvedLoan.approver?.full_name ?? 'the Organizer'}</Text> on {shortDate(approvedLoan.approved_at)}
                {approvedLoan.approved_principal && Number(approvedLoan.approved_principal) < Number(approvedLoan.principal) ? ' · partial amount' : ''}
              </Text>
            </View>

            <SectionHead title="Progress" aside="Step 3 of 4" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
              <Tracker steps={[
                { title: 'You sent the request', sub: shortDate(approvedLoan.applied_at), done: true },
                { title: 'Organizer approved', sub: `${shortDate(approvedLoan.approved_at)} · ${formatPeso(approvedLoan.approved_principal ?? approvedLoan.principal)} approved`, done: true },
                { title: 'Treasurer is releasing the money', sub: 'Sent outside the app, with a reference number recorded', done: false, now: true },
                { title: 'Repayments begin', sub: 'Whenever you’re ready, once released', done: false },
              ]} />
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
