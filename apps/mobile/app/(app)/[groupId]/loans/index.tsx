import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Clock3, AlertTriangle, Coins, Repeat, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoans, useLoan, useMemberLoanEligibility, useCancelLoan } from '@/features/lending/lending.hooks';
import type { Loan, LoanPayment } from '@/api/lending';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type PageState = 'active' | 'pending' | 'release' | 'can' | 'blocked';

function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Badge({ tone, label, Icon }: { tone: IntentName; label: string; Icon: any }) {
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
      <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: t.strong, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={9} color="#fff" strokeWidth={2.6} />
      </View>
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

function Split({ items }: { items: { k: string; v: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: semantic.border }}>
      {items.map((it, i) => (
        <View key={it.k} style={{ flex: 1, paddingLeft: i > 0 ? 14 : 0, borderLeftWidth: i > 0 ? 1 : 0, borderColor: semantic.border }}>
          <Text variant="overline" color="muted">{it.k}</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }}>{it.v}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function ChecklistRow({ pass, title, sub }: { pass: boolean; title: string; sub: string }) {
  const tone = pass ? intent.success : intent.danger;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 9, borderBottomWidth: 1, borderColor: semantic.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {pass ? <Check size={11} color={tone.text} strokeWidth={3} /> : <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: tone.text }}>!</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: pass ? semantic.textPrimary : intent.danger.text }}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{sub}</Text>
      </View>
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

function PaymentRow({ p }: { p: LoanPayment }) {
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="label" style={{ fontSize: 13.5 }}>{formatPeso(p.amount)}</Text>
        <StatusBadge entity="loan" value={p.status} />
      </View>
      <Text variant="caption" color="secondary">
        Principal {formatPeso(p.principal_portion)} · Interest {formatPeso(p.interest_portion)}
      </Text>
      <Text variant="caption" color="muted">
        {p.auto_confirmed
          ? `Paid automatically via ${p.gateway_provider ?? 'payment gateway'}`
          : `Recorded by ${p.recorder?.full_name ?? 'an officer'}${p.verifier ? `, verified by ${p.verifier.full_name}` : ''}`}
        {shortDate(p.paid_date) ? ` · ${shortDate(p.paid_date)}` : ''}
      </Text>
    </View>
  );
}

function PastLoanRow({ loan }: { loan: Loan }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
      <View style={{ gap: 2 }}>
        <Text variant="label" style={{ fontSize: 13.5 }}>{formatPeso(loan.principal)}</Text>
        <Text variant="caption" color="secondary">{loan.purpose ?? 'Loan'}</Text>
      </View>
      <StatusBadge entity="loan" value={loan.status} />
    </View>
  );
}

// key must exactly match a string in the eligibility API's `reasons` array.
const ELIGIBILITY_CHECKS: { key: string; passTitle: string; failTitle: string; sub: string }[] = [
  { key: 'Member is not verified', passTitle: 'Account verified', failTitle: 'Account not verified', sub: 'Submit a valid ID from your profile. Usually reviewed within a couple of days.' },
  { key: 'Member already has an active loan', passTitle: 'No active loan', failTitle: 'You already have an active loan', sub: 'Settle your current loan before requesting another.' },
  { key: 'Member has an unresolved late-contribution penalty', passTitle: 'No unresolved penalty', failTitle: 'An unresolved late-payment penalty', sub: 'Settle the overdue contribution behind it — the Owner reviews the penalty separately.' },
];

export default function LoansOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { group, membership } = useActiveGroup();
  const allLoans = useLoans(groupId!, {});
  const cancel = useCancelLoan(groupId!);
  const [showPast, setShowPast] = useState(false);

  // listLoans only self-scopes server-side when role === 'member' — for
  // owner/treasurer/auditor it returns the whole group's loans, so filter here
  // to guarantee this page only ever shows the caller's own loans.
  const rows = (allLoans.data ?? []).filter((l) => l.membership_id === membership?.id);
  const activeLoan = rows.find((l) => l.status === 'active') ?? null;
  const pendingLoan = rows.find((l) => l.status === 'pending') ?? null;
  const approvedLoan = rows.find((l) => l.status === 'approved') ?? null;
  const pastLoans = useMemo(() => rows.filter((l) => ['paid', 'rejected', 'cancelled'].includes(l.status)), [rows]);
  const currentLoan = activeLoan ?? pendingLoan ?? approvedLoan;

  const detail = useLoan(groupId!, currentLoan?.id);
  const payments = detail.data?.payments ?? [];
  const eligibility = useMemberLoanEligibility(groupId!);

  const state: PageState =
    activeLoan ? 'active' :
    pendingLoan ? 'pending' :
    approvedLoan ? 'release' :
    eligibility.data?.eligible ? 'can' : 'blocked';

  const loading = allLoans.loading || (!!currentLoan && detail.loading) || (!currentLoan && eligibility.loading);

  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });

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

  const TITLES: Record<PageState, { t: string; s: string }> = {
    active: { t: 'My loan', s: group?.name ?? 'Group' },
    pending: { t: 'My loan request', s: group?.name ?? 'Group' },
    release: { t: 'My loan request', s: group?.name ?? 'Group' },
    can: { t: 'Borrow from the fund', s: group?.name ?? 'Group' },
    blocked: { t: 'Borrow from the fund', s: group?.name ?? 'Group' },
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="My loan" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  const principal = Number(activeLoan?.principal ?? 0);
  const outstanding = Number(activeLoan?.outstanding_balance ?? 0);
  const repaidAmount = Math.max(0, principal - outstanding);
  const repaidPct = principal > 0 ? Math.min(100, Math.round((repaidAmount / principal) * 100)) : 0;
  const interestToDate = payments
    .filter((p) => p.status === 'approved' || p.status === 'paid')
    .reduce((s, p) => s + Number(p.interest_portion), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title={TITLES[state].t} subtitle={TITLES[state].s} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Active loan ---------------- */}
        {state === 'active' && activeLoan && (
          <>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Still to repay</Text>
                <Badge tone="primary" label="Active" Icon={Repeat} />
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(outstanding)}</Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
                Borrowed <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{formatPeso(principal)}</Text> on {shortDate(activeLoan.disbursed_at ?? activeLoan.applied_at)}
                {activeLoan.interest_rate ? ` · ${(Number(activeLoan.interest_rate) * 100).toFixed(1)}% monthly interest` : ''}
              </Text>

              <View style={{ marginTop: 15 }}>
                <View style={{ height: 9, borderRadius: 5, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: (repaidPct + '%') as any, borderRadius: 5, backgroundColor: intent.success.base }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text variant="caption" color="secondary">Repaid <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{formatPeso(repaidAmount)}</Text></Text>
                  <Text variant="caption" color="secondary"><Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{repaidPct}%</Text> complete</Text>
                </View>
              </View>

              <Split items={[{ k: 'Principal left', v: formatPeso(outstanding) }, { k: 'Interest paid to date', v: formatPeso(interestToDate) }]} />
            </View>

            <View style={{ marginTop: 15, backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13 }}>
              <Text variant="caption" color="secondary" style={{ lineHeight: 17 }}>
                Pay any amount, any time — each repayment goes to interest first, then principal. Submit one with proof for an officer to confirm, or pay an officer directly and they'll record it.
              </Text>
            </View>

            <Button label="Make a repayment" leading={<Repeat size={16} color="#fff" />} onPress={() => go('loans/repay')} style={{ marginTop: 14 }} />

            <SectionHead title="Repayment history" aside={`${payments.length} made`} />
            {payments.length === 0 ? (
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, CARD_SHADOW]}>
                <Text variant="body" color="muted">No repayments recorded yet.</Text>
              </View>
            ) : (
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
                {payments.map((p) => <PaymentRow key={p.id} p={p} />)}
              </View>
            )}
          </>
        )}

        {/* ---------------- Awaiting decision ---------------- */}
        {state === 'pending' && pendingLoan && (
          <>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Requested</Text>
                <Badge tone="info" label="With the Owner" Icon={Clock3} />
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
                { title: 'Owner is deciding', sub: 'Reviews the amount against your record and the fund’s cash', done: false, now: true },
                { title: 'Treasurer releases the money', sub: 'Sent outside the app, with a reference number', done: false },
                { title: 'Repayments begin', sub: 'Whenever you’re ready, once released', done: false },
              ]} />
            </View>

            <SectionHead title="What you asked for" />
            <Split items={[
              { k: 'Amount', v: formatPeso(pendingLoan.principal) },
              { k: 'Term', v: `${pendingLoan.term_months} mo` },
            ]} />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, marginTop: 15 }, CARD_SHADOW]}>
              <Text variant="body" color="secondary" style={{ fontSize: 12.5, lineHeight: 18 }}>
                {pendingLoan.purpose ? `Purpose: ${pendingLoan.purpose}. ` : ''}
                Estimated principal per month: <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{formatPeso(Number(pendingLoan.principal) / pendingLoan.term_months)}</Text> — interest is added once the Owner sets the rate.
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
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Approved</Text>
                <Badge tone="neutral" label="Awaiting release" Icon={Check} />
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(approvedLoan.approved_principal ?? approvedLoan.principal)}</Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                Approved by <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{approvedLoan.approver?.full_name ?? 'the Owner'}</Text> on {shortDate(approvedLoan.approved_at)}
                {approvedLoan.approved_principal && Number(approvedLoan.approved_principal) < Number(approvedLoan.principal) ? ' · partial amount' : ''}
              </Text>
            </View>

            <SectionHead title="Progress" aside="Step 3 of 4" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
              <Tracker steps={[
                { title: 'You sent the request', sub: shortDate(approvedLoan.applied_at), done: true },
                { title: 'Owner approved', sub: `${shortDate(approvedLoan.approved_at)} · ${formatPeso(approvedLoan.approved_principal ?? approvedLoan.principal)} approved`, done: true },
                { title: 'Treasurer is releasing the money', sub: 'Sent outside the app, with a reference number recorded', done: false, now: true },
                { title: 'Repayments begin', sub: 'Whenever you’re ready, once released', done: false },
              ]} />
            </View>

            <Text variant="caption" color="secondary" style={{ marginTop: 4, lineHeight: 17 }}>
              Money is sent outside the app. If nothing arrives within a couple of days, contact an officer.
            </Text>
          </>
        )}

        {/* ---------------- Can request ---------------- */}
        {state === 'can' && (
          <>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Available to you</Text>
                <Badge tone="success" label="Eligible" Icon={Check} />
              </View>
              <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8, marginTop: 6 }}>
                Up to {formatPeso(eligibility.data?.available_cash ?? 0)}
              </Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>Limited by the fund's cash on hand today</Text>
            </View>

            <SectionHead title="You meet every requirement" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, paddingHorizontal: 16, paddingTop: 4 }, CARD_SHADOW]}>
              {ELIGIBILITY_CHECKS.map((c) => <ChecklistRow key={c.key} pass title={c.passTitle} sub={c.sub} />)}
            </View>

            <SectionHead title="Before you request" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, CARD_SHADOW]}>
              <Text variant="body" color="secondary" style={{ fontSize: 12.5, lineHeight: 19 }}>
                The Owner makes the final decision and sets the interest rate when approving — approval isn't automatic, and the amount may be reduced if the fund needs to keep cash for other members.
              </Text>
            </View>

            <Button label="Request a loan" leading={<Coins size={18} color="#fff" />} onPress={() => go('loans/request')} style={{ marginTop: 18 }} />
          </>
        )}

        {/* ---------------- Not eligible ---------------- */}
        {state === 'blocked' && (
          <>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Loan requests</Text>
                <Badge tone="warning" label="Locked" Icon={AlertTriangle} />
              </View>
              <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 6 }}>Not available yet</Text>
              <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
                {eligibility.data?.reasons.length ?? 0} thing{(eligibility.data?.reasons.length ?? 0) === 1 ? '' : 's'} need sorting before you can borrow
              </Text>
            </View>

            <SectionHead title="What's blocking you" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, paddingHorizontal: 16, paddingTop: 4 }, CARD_SHADOW]}>
              {ELIGIBILITY_CHECKS.map((c) => {
                const failed = eligibility.data?.reasons.includes(c.key) ?? false;
                return <ChecklistRow key={c.key} pass={!failed} title={failed ? c.failTitle : c.passTitle} sub={c.sub} />;
              })}
            </View>

            <Text variant="caption" color="secondary" style={{ marginTop: 16, lineHeight: 17 }}>
              These rules protect everyone's money, including yours. Once every item clears, the request button unlocks on its own.
            </Text>

            <Button
              label={`Request a loan — ${eligibility.data?.reasons.length ?? 0} item${(eligibility.data?.reasons.length ?? 0) === 1 ? '' : 's'} to clear`}
              disabled
              style={{ marginTop: 18 }}
            />
          </>
        )}

        {/* ---------------- Past loans — always visible ---------------- */}
        {pastLoans.length > 0 && (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden', marginTop: 20 }, CARD_SHADOW]}>
            <Pressable onPress={() => setShowPast((v) => !v)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Past loans ({pastLoans.length})</Text>
              {showPast ? <ChevronUp size={18} color={semantic.textMuted} /> : <ChevronDown size={18} color={semantic.textMuted} />}
            </Pressable>
            {showPast && pastLoans.map((loan) => <PastLoanRow key={loan.id} loan={loan} />)}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
