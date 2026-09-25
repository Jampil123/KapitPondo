import { useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator, Image, Modal } from 'react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { useRouter } from 'expo-router';
import {
  ArrowUpRight, BarChart3, ArrowDownRight, CheckCircle2, ScrollText,
  ArrowUpCircle,
  PiggyBank, HandCoins, Receipt, X, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
import { DashboardBand, FoldTarget, glassPanel, onBandText } from '@/components/shared/DashboardBand';
import { ENTRY_LABEL } from '@/features/activity/entryCopy';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { parseApiDate } from '@/lib/cycle';
import { useAuth } from '@/context/AuthContext';
import { useSummary, useLedger, useMemberBalances } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions, useConfirmContribution, useRejectContribution } from '@/features/contributions/contributions.hooks';
import { useLoans, useRepayments, useConfirmRepaymentReceipt, useRejectRepayment } from '@/features/lending/lending.hooks';
import { useSignoffQueue } from '@/features/signoff/signoff';
import type { Contribution } from '@/api/contributions';
import type { Loan } from '@/api/lending';

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** "15th" — day of month only, built by hand so it doesn't depend on the device's Intl support. */
function dayOnly(iso: string) {
  const d = parseApiDate(iso).getDate();
  if (isNaN(d)) return '';
  const suffix = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th';
  return `${d}${suffix}`;
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
function CashRow({ label, amount, tone }: { label: string; amount: number; tone: 'pos' | 'neg' }) {
  const sign = tone === 'pos' ? '+' : '−';
  const color = tone === 'pos' ? intent.success.text : intent.danger.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_700Bold', color }}>{sign}{formatPeso(amount)}</Text>
    </View>
  );
}

function CashCard({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  const { cycle } = useActiveCycle(groupId);

  const contributions = Number(data?.total_contributions ?? 0);
  const repayments = Number(data?.total_loan_repayments ?? 0);
  const disbursed = Number(data?.total_loan_disbursements ?? 0);
  const distributed = Number(data?.total_distributions ?? 0);
  const owedBack = Math.max(0, disbursed - repayments);

  return (
    <View style={{ paddingTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text variant="overline" style={{ color: onBandText }}>Cash on hand</Text>
        {cycle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent.success.soft, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cycle.status === 'active' ? intent.success.base : semantic.textMuted }} />
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: cycle.status === 'active' ? intent.success.text : semantic.textSecondary }}>{cycle.status === 'active' ? 'Active' : cycle.status === 'draft' ? 'Draft' : 'Closed'}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
      ) : (
        <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.7 }}>{formatPeso(data?.available_cash)}</Text>
      )}

      <View style={[glassPanel, { marginTop: 10, padding: 12, gap: 4 }]}>
        <CashRow label="Contributions received" amount={contributions} tone="pos" />
        <CashRow label="Repayments received" amount={repayments} tone="pos" />
        <CashRow label="Loans released" amount={disbursed} tone="neg" />
        {distributed > 0 ? <CashRow label="Distributions paid" amount={distributed} tone="neg" /> : null}

        {owedBack > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 7, marginTop: 1, borderTopWidth: 1, borderColor: semantic.border }}>
            <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>Owed back by members</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>{formatPeso(owedBack)}</Text>
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
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, shadowToken.soft]}>
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

/* ---------------- Payment verifications — confirm/return right here, like the Organizer's decision cards ---------------- */
type ProofRow = { id: string; name: string; sub: string; amount: number; late?: boolean; kind: 'contribution' | 'repayment'; proof: string | null };

const VERIFY_SHOWN = 3;

function VerifyAction({ label, tone, Icon, onPress, disabled }: { label: string; tone: 'ok' | 'danger'; Icon: any; onPress: () => void; disabled?: boolean }) {
  // Confirm uses the app's primary button color; Return stays a soft red — same as the Organizer's quick actions.
  const t = tone === 'ok' ? { bg: semantic.brandDark, fg: '#fff' } : { bg: intent.danger.soft, fg: intent.danger.text };
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.bg, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 11, opacity: disabled ? 0.5 : 1 }}>
      <Icon size={12} color={t.fg} strokeWidth={2.6} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.fg }}>{label}</Text>
    </Pressable>
  );
}

function VerificationCard({ groupId, row, onChanged }: { groupId: string; row: ProofRow; onChanged: () => void }) {
  // Step 1 of 2 (migration 0075): confirming moves it to "Pending verification"; the Auditor's verification posts it.
  const approveContribution = useConfirmContribution(groupId);
  const rejectContribution = useRejectContribution(groupId);
  const confirmRepayment = useConfirmRepaymentReceipt(groupId);
  const rejectRepayment = useRejectRepayment(groupId);
  const approve = row.kind === 'contribution' ? approveContribution : confirmRepayment;
  const reject = row.kind === 'contribution' ? rejectContribution : rejectRepayment;
  const [returning, setReturning] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  const busy = approve.loading || reject.loading;
  const what = row.kind === 'contribution' ? 'contribution' : 'repayment';

  async function onConfirm() {
    const ok = await approve.run(row.id);
    if (ok !== undefined) { onChanged(); toast('Confirmed — waiting for the Auditor’s verification'); }
    else if (approve.error) Alert.alert('Could not confirm', approve.error.message);
  }
  async function onReturn(reason: string) {
    setReturning(false);
    const ok = await reject.run(row.id, reason || undefined);
    if (ok !== undefined) { onChanged(); toast(`Returned ${row.name}'s ${what}`); }
    else if (reject.error) Alert.alert('Could not return', reject.error.message);
  }

  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, gap: 12, marginBottom: 10 }, shadowToken.soft]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="overline" color="muted">{row.kind === 'contribution' ? 'Contribution' : 'Loan repayment'}</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary, marginTop: 4 }} numberOfLines={2}>{row.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text variant="caption" color="secondary" numberOfLines={1}>{row.sub}</Text>
            {row.late ? <Tag tone="late">Late</Tag> : null}
          </View>
        </View>
        <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(row.amount)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {row.proof ? (
          <Pressable onPress={() => setViewingProof(true)} style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', backgroundColor: semantic.surfaceAlt }}>
            <Image source={{ uri: row.proof }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
        ) : (
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Receipt size={16} color={semantic.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }} />
        <VerifyAction label="Return" tone="danger" Icon={X} onPress={() => setReturning(true)} disabled={busy} />
        <VerifyAction label="Confirm" tone="ok" Icon={Check} onPress={onConfirm} disabled={busy} />
      </View>
      <ReasonPrompt
        visible={returning}
        title={`Return ${row.name}'s ${what}?`}
        confirmLabel="Return"
        destructive
        onCancel={() => setReturning(false)}
        onConfirm={onReturn}
      />
      <Modal visible={viewingProof} transparent animationType="fade" onRequestClose={() => setViewingProof(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewingProof(false)}>
          <View style={{ width: '100%', backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text variant="label">{row.name}</Text>
                <Text variant="caption" color="secondary">{formatPeso(row.amount)}</Text>
              </View>
              <Pressable onPress={() => setViewingProof(false)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {row.proof ? <Image source={{ uri: row.proof }} style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: semantic.surfaceAlt }} resizeMode="contain" /> : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ProofsToReview({ groupId, go }: { groupId: string; go: (r: string, p?: Record<string, string>) => void }) {
  const { member } = useAuth();
  const pendingContribs = useContributions(groupId, { status: 'submitted' });
  const pendingRepayments = useRepayments(groupId, 'submitted');
  const balances = useMemberBalances(groupId);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (balances.data ?? []).forEach((b) => m.set(b.membership_id, b.full_name ?? 'Member'));
    return m;
  }, [balances.data]);
  // Anything this Treasurer paid or recorded themselves is the Organizer's to confirm, not theirs.
  const contribRows: ProofRow[] = (pendingContribs.data ?? [])
    .filter((c: Contribution) => c.recorded_by !== member?.id && c.memberships?.member_id !== member?.id)
    .map((c: Contribution) => ({
      id: c.id,
      name: nameById.get(c.membership_id) ?? 'Member',
      sub: `Sent ${shortDate(c.created_at)}`,
      amount: Number(c.amount),
      late: c.is_late,
      kind: 'contribution',
      proof: c.proof_signed_url,
    }));
  const repayRows: ProofRow[] = (pendingRepayments.data ?? [])
    .filter((p) => p.recorded_by !== member?.id && p.loans?.membership?.member_id !== member?.id)
    .map((p) => ({
      id: p.id,
      name: p.loans?.membership?.members?.full_name ?? 'Member',
      sub: `Sent ${shortDate(p.created_at)}`,
      amount: Number(p.amount),
      kind: 'repayment',
      proof: p.proof_signed_url,
    }));

  const rows = [...contribRows, ...repayRows];
  const loading = (pendingContribs.data == null && !pendingContribs.error) || (pendingRepayments.data == null && !pendingRepayments.error);
  const refresh = () => { pendingContribs.refetch(); pendingRepayments.refetch(); };
  // "See all" opens whichever list the hidden ones belong to — repayments live on their own page.
  const hidden = rows.slice(VERIFY_SHOWN);
  const seeAllRepayments = hidden.length > 0 && hidden.every((r) => r.kind === 'repayment');

  return (
    <>
      <SectionHead title="Payment Verifications" aside={loading ? undefined : rows.length > 0 ? `${rows.length} waiting` : 'All clear'} tone={rows.length > 0 ? 'hot' : 'calm'} />

      {loading ? (
        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 24, alignItems: 'center' }, shadowToken.soft]}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyRow title="No proofs waiting" sub="New submissions will show up here" />
      ) : (
        <>
          {rows.slice(0, VERIFY_SHOWN).map((r) => <VerificationCard key={`${r.kind}-${r.id}`} groupId={groupId} row={r} onChanged={refresh} />)}
          {hidden.length > 0 ? (
            <Pressable
              onPress={() => (seeAllRepayments ? go('loans/record-repayment') : go('contributions/confirm', { tab: 'pending' }))}
              style={{ paddingVertical: 12, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: semantic.border }}
            >
              <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>See all {rows.length}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </>
  );
}

/* ---------------- Owner's own loan — needs the Treasurer's decision ---------------- */
// An Owner can't approve their own loan (no-self-approval rule), so when the
// Owner is the borrower, the Treasurer is the one authorized to decide it —
// see lending.routes.js. Without this, that request would only ever be
// reachable by manually opening Loan decision from More.
function OwnerLoanToDecide({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const pendingLoans = useLoans(groupId, { status: 'pending' });
  const loans = (pendingLoans.data ?? []).filter((l) => l.membership?.role === 'owner');

  if (pendingLoans.loading || loans.length === 0) return null;

  function borrowerName(loan: Loan) { return loan.membership?.members?.full_name ?? 'Organizer'; }

  return (
    <>
      <SectionHead title="Organizer's loan request" aside={`${loans.length} pending`} tone="hot" />
      {loans.map((loan) => (
        <View key={loan.id} style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, marginBottom: 10 }, shadowToken.soft]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{borrowerName(loan)}</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{loan.purpose ?? 'No purpose given'} · {loan.term_months} months</Text>
            </View>
            <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(loan.principal)}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <Tag tone="late">The Organizer can't approve their own loan — you decide this one</Tag>
          </View>
          <Pressable onPress={() => go('loans/decisions')} style={{ marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.brandDark }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Review request</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}

/* ---------------- Loans the Treasurer reviews before release (the Auditor's own) ---------------- */
function LoansToReview({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { mine } = useSignoffQueue(groupId);
  const reviews = mine.filter((i) => i.action === 'review');
  if (reviews.length === 0) return null;
  return (
    <>
      <SectionHead title="Review before release" aside={`${reviews.length} waiting`} tone="hot" />
      {reviews.map((r) => (
        <Pressable
          key={r.key}
          onPress={() => router.push({ pathname: '/(app)/[groupId]/signoffs' as any, params: { groupId } })}
          style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, shadowToken.soft]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{r.name}</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Officer loan · approved by the Organizer · review to unlock release</Text>
          </View>
          <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{r.amount != null ? formatPeso(r.amount) : ''}</Text>
        </Pressable>
      ))}
    </>
  );
}

/* ---------------- To release ---------------- */
function ToRelease({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { data } = useSummary(groupId);
  const { member } = useAuth();
  const approvedLoans = useLoans(groupId, { status: 'approved' });
  // Not my own loan (the Organizer releases that). Officer loans still in review stay listed, locked, so it's clear they're on the way.
  const loans = (approvedLoans.data ?? []).filter((l) => l.membership?.member_id !== member?.id);
  const inReview = (l: Loan) => !!l.review_required && !l.reviewed_at;
  const reviewer = (l: Loan) => (l.membership?.role === 'auditor' ? 'you' : 'the Auditor');
  const cash = Number(data?.available_cash ?? 0);

  if (approvedLoans.loading) {
    return (
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 24, alignItems: 'center' }, shadowToken.soft]}>
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
            <View key={loan.id} style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, marginBottom: 10 }, shadowToken.soft]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{borrowerName(loan)}</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Approved by Organizer · {shortDate(loan.approved_at)} · {loan.term_months} months</Text>
                </View>
                <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(loan.approved_principal ?? loan.principal)}</Text>
              </View>
              <View style={{ marginTop: 10 }}>
                {inReview(loan)
                  ? <Tag tone="late">{`Officer loan — waiting for ${reviewer(loan)} to review before release`}</Tag>
                  : <Tag tone={covered ? 'ok' : 'late'}>{covered ? `Cash on hand covers this · ${formatPeso(cash)}` : `Short by ${formatPeso(Number(loan.principal) - cash)}`}</Tag>}
              </View>
              <Pressable
                onPress={() => go('loans/disburse')}
                disabled={inReview(loan)}
                style={{ marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.brandDark, opacity: inReview(loan) ? 0.4 : 1 }}
              >
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{inReview(loan) ? 'Waiting for review' : 'Release funds'}</Text>
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
      <SectionHead title="This month's collection" aside={currentDue ? `Due ${dayOnly(currentDue)}` : undefined} />
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 17 }, shadowToken.soft]}>
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
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{info?.name ?? 'Member'}</Text>
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
  { label: 'Contribution', icon: ArrowUpCircle, route: 'contributions/confirm', params: { tab: 'record' } },
  { label: 'Repayment', icon: HandCoins, route: 'loans/record-repayment' },
  { label: 'Transactions', icon: ScrollText, route: 'reports/my-transactions' },
  { label: 'Group Ledger', icon: PiggyBank, route: 'reports/group-ledger' },
];

/* ---------------- Recent transactions ---------------- */
function contributorName(e: { membership: { members: { full_name: string } | null } | null }) {
  return e.membership?.members?.full_name ?? null;
}

const RECENT_TRANSACTIONS_LIMIT = 5;

function RecentTransactions({ groupId, go }: { groupId: string; go: (route: string, extraParams?: Record<string, string>) => void }) {
  const ledger = useLedger(groupId, { limit: RECENT_TRANSACTIONS_LIMIT });
  const txns = ledger.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: txns.length ? 6 : 20, overflow: 'hidden' }, shadowToken.soft]}>
      {ledger.loading ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 14 }} />
      ) : txns.length === 0 ? (
        <Text variant="body" color="muted" style={{ textAlign: 'center' }}>No transactions yet.</Text>
      ) : (
        <>
          {txns.map((e, i) => {
            const credit = e.direction === 'credit';
            const Icon = credit ? ArrowDownRight : ArrowUpRight;
            const name = contributorName(e);
            const detail = ENTRY_LABEL[e.entry_type] ?? e.description ?? e.entry_type.replace(/_/g, ' ');
            return (
              <Pressable
                key={e.id}
                onPress={() => go('activity/[entryId]', { entryId: e.id, scope: 'group' })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderBottomWidth: i < txns.length - 1 ? 1 : 0, borderColor: semantic.border }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={credit ? intent.success.text : semantic.brandDark} />
                </View>
                {/* flex + minWidth:0 lets the text actually shrink/ellipsize
                    instead of pushing into (and overlapping) the amount on
                    the right — the "Posted" tag that used to crowd this row
                    is dropped since every ledger entry here is, by
                    definition, already posted; it never conveyed anything. */}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={2}>{name ?? detail}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {name ? `${detail} · ` : ''}{shortDate(e.posted_at)}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: credit ? intent.success.text : semantic.textPrimary }}>
                  {credit ? '+' : '-'}{formatPeso(e.amount)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => go('reports/my-transactions')} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>See all transactions</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function TreasurerHero({ groupId }: { groupId: string }) {
  return (
    <DashboardBand>
      <FoldTarget>
        <CashCard groupId={groupId} />
      </FoldTarget>
    </DashboardBand>
  );
}

export function TreasurerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string, extraParams?: Record<string, string>) =>
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId, ...extraParams } });

  return (
    <>
      <OwnerLoanToDecide groupId={groupId} go={go} />

      <ProofsToReview groupId={groupId} go={go} />

      <LoansToReview groupId={groupId} />

      <ToRelease groupId={groupId} go={go} />

      <CollectionBlock groupId={groupId} go={go} />

      <SectionHead title="Records" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => go(a.route, a.params)}
            style={[{ width: '23%', borderRadius: 18, backgroundColor: semantic.card, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, shadowToken.soft]}
          >
            <a.icon size={26} color={NAV_BG} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHead title="Recent transactions" aside="Posted" />
      <RecentTransactions groupId={groupId} go={go} />
    </>
  );
}
