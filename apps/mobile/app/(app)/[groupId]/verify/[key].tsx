import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Image, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { Check, X, ScanLine, Receipt, Info } from 'lucide-react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { Text } from '@/components/ui/Text';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { readContributionProof } from '@/api/contributions';
import { readRepaymentProof, headLabel } from '@/api/lending';
import { useLoans, useLoan, useLiquidity } from '@/features/lending/lending.hooks';
import { totalInterest } from '@/features/lending/remainingInterest';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useSignoffQueue, ROLE_NAME, loanRole, type SignoffItem, type Role } from '@/features/signoff/signoff';
import { useSignoffActions, primaryLabel, canSendBack, sendBackLabel } from '@/features/signoff/useSignoffActions';
import { useLedgerEntryDetail } from '@/features/ledger/ledger.hooks';
import { ENTRY_TYPE_LABEL } from '@/features/audit/GroupLedgerView';
import { entryRef } from '@/api/ledger';
import { itemMatch } from '@/features/audit/VerificationQueue';
import type { ProofField } from '@/features/signoff/proofMatch';

const METHOD: Record<string, string> = { gcash: 'E-wallet', cash: 'Cash', bank_transfer: 'Bank transfer', other: 'Other' };

function recordedLine(i: SignoffItem) {
  if (!i.recordedAt) return null;
  const d = new Date(i.recordedAt);
  const today = new Date().toDateString() === d.toDateString();
  const when = `${today ? 'today' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`;
  return `${METHOD[i.method ?? ''] ?? 'Payment'}, recorded by ${i.recordedBy ?? i.name} ${when}`;
}

// UC-LG-02 step 2: the entry being reversed, with its proof, right on the review page.
function ReversalEntryCard({ groupId, entryId, onOpen }: { groupId: string; entryId: string; onOpen: () => void }) {
  const q = useLedgerEntryDetail(groupId, entryId);
  const [viewing, setViewing] = useState(false);
  const d = q.data;
  if (!d) return q.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 14 }} /> : null;
  const e = d.entry;
  const kind = ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type.replace(/_/g, ' ');
  const who = e.membership?.members?.full_name ?? d.record?.name ?? null;
  const posted = new Date(e.posted_at);
  const rows: [string, string | null][] = [
    ['Entry', `${entryRef(e)} · ${kind}`],
    ['Amount', `${e.direction === 'credit' ? '+' : '−'}${formatPeso(e.amount)}`],
    ['Member', who],
    ['Posted', isNaN(posted.getTime()) ? null : posted.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })],
  ];
  return (
    <Card style={{ marginTop: 14 }}>
      <Text variant="caption" color="secondary" style={{ marginBottom: 6 }}>Original entry</Text>
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 }}>
          <Text variant="caption" color="secondary">{k}</Text>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
        </View>
      ))}
      {d.proof_url ? (
        <Pressable onPress={() => setViewing(true)} style={{ marginTop: 10 }}>
          <Image source={{ uri: d.proof_url }} style={{ width: '100%', height: 170, borderRadius: 14, backgroundColor: semantic.surfaceAlt }} resizeMode="cover" />
        </Pressable>
      ) : (
        <Text variant="caption" color="muted" style={{ marginTop: 8 }}>No proof attached to this entry.</Text>
      )}
      <Pressable onPress={onOpen} style={{ marginTop: 12, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.surfaceAlt }}>
        <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Open full entry</Text>
      </Pressable>
      <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewing(false)}>
          {d.proof_url ? <Image source={{ uri: d.proof_url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </Card>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16 }, shadowToken.soft, style]}>{children}</View>;
}

function Title({ children }: { children: string }) {
  return <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 22, marginBottom: 9 }}>{children}</Text>;
}

/** One compared field: label on top, recorded ← mark → read. */
function CompareRow({ f, last }: { f: ProofField; last: boolean }) {
  const tone = f.state === 'match' ? intent.success : f.state === 'mismatch' ? intent.danger : null;
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 11.5, color: semantic.textSecondary, marginBottom: 4 }}>{f.label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={2}>{f.recorded}</Text>
        <View style={{ width: 24, height: 24, borderRadius: 12, marginHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: tone ? tone.soft : semantic.surfaceAlt }}>
          {f.state === 'match' ? <Check size={12} color={intent.success.text} strokeWidth={3} /> : f.state === 'mismatch' ? <X size={12} color={intent.danger.text} strokeWidth={3} /> : <Text style={{ fontSize: 11, color: semantic.textMuted }}>?</Text>}
        </View>
        <Text style={{ flex: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: f.state === 'unread' ? semantic.textMuted : f.state === 'mismatch' ? intent.danger.text : semantic.textPrimary }} numberOfLines={2}>{f.read}</Text>
      </View>
      {!last ? <View style={{ width: 2, height: 14, backgroundColor: intent.success.soft, marginTop: 4 }} /> : null}
    </View>
  );
}

function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${shortDate(iso)}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`;
}

/** What this step is and what tapping the button does — one line under the amount. */
function stepNote(i: SignoffItem): string | null {
  const l = i.loan;
  if (!l) return null;
  const amount = formatPeso(l.approved_principal ?? l.principal);
  if (i.action === 'review') return 'Officer loan — check it before any cash goes out.';
  if (i.action === 'release') return `Hand ${amount} to ${i.name}, then tap Release.`;
  if (i.action === 'verify_release') return `Check that ${i.name} received ${amount}${l.disburser?.full_name ? ` from ${l.disburser.full_name}` : ''}. Verifying posts it to the group ledger.`;
  return null;
}

/** Label on the left, value on the right; `strong` for the bottom line. */
function TermRow({ label, value, strong, last }: { label: string; value: string; strong?: boolean; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <Text style={{ fontSize: 12.5, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: strong ? 14 : 13, fontFamily: strong ? 'Poppins_700Bold' : 'Poppins_600SemiBold', color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}

/** One pass/fail line, same marks as the contribution rule check. */
function CheckRow({ ok, title, sub, last }: { ok: boolean; title: string; sub?: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ok ? intent.success.soft : intent.danger.base, marginTop: 1 }}>
        {ok ? <Check size={12} color={intent.success.text} strokeWidth={3} /> : <X size={12} color="#fff" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{title}</Text>
        {sub ? <Text variant="caption" style={{ color: ok ? semantic.textSecondary : intent.danger.text, marginTop: 1 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** Loan sign-offs (review, release, verify release): the terms, the purpose, and the checks behind the decision. */
function LoanDetails({ groupId, i }: { groupId: string; i: SignoffItem }) {
  const l = i.loan!;
  const loans = useLoans(groupId);
  const liquidity = useLiquidity(groupId);

  const amount = Number(l.approved_principal ?? l.principal);
  const partial = l.approved_principal != null && Number(l.approved_principal) !== Number(l.principal);
  const rate = l.interest_rate != null ? Number(l.interest_rate) : null;
  const interest = totalInterest(l);
  const months = l.term_months;

  // Cash is already out once released — the cover check only matters before that.
  const released = i.action === 'verify_release';
  const cash = Number(liquidity.data?.available_cash ?? 0);
  const covers = cash >= amount;
  const others = (loans.data ?? []).filter((x) => x.id !== l.id && x.membership_id === l.membership_id && x.status === 'active');
  const owed = others.reduce((s, x) => s + Number(x.outstanding_balance), 0);

  return (
    <>
      <Title>Loan terms</Title>
      <Card style={{ paddingVertical: 6 }}>
        {partial ? <TermRow label="Requested" value={formatPeso(l.principal)} /> : null}
        <TermRow label={partial ? 'Approved' : 'Amount'} value={formatPeso(amount)} />
        <TermRow label="Interest" value={rate != null ? `${+(rate * 100).toFixed(2)}% a month` : '—'} />
        <TermRow label="Term" value={`${months} month${months === 1 ? '' : 's'}`} />
        {months ? <TermRow label="Monthly payment" value={formatPeso(Math.round(((amount + interest) / months) * 100) / 100)} /> : null}
        <TermRow label="Total to repay" value={formatPeso(amount + interest)} strong last />
      </Card>

      {i.note ? (
        <>
          <Title>Purpose</Title>
          <Card>
            <Text style={{ fontSize: 13.5, lineHeight: 19, color: semantic.textPrimary }}>{i.note}</Text>
          </Card>
        </>
      ) : null}

      <Title>Checks</Title>
      <Card style={{ paddingVertical: 4 }}>
        {!released ? (
          liquidity.loading ? <ActivityIndicator color={semantic.brand} style={{ marginVertical: 12 }} /> : (
            <CheckRow
              ok={covers}
              title={covers ? 'The fund can cover it' : "The fund can't cover it"}
              sub={`${formatPeso(cash)} cash on hand${covers ? ` · ${formatPeso(cash - amount)} left after release` : ` · short by ${formatPeso(amount - cash)}`}`}
            />
          )
        ) : null}
        <CheckRow
          ok={others.length === 0}
          title={others.length === 0 ? 'No other active loan' : `${others.length} other active loan${others.length === 1 ? '' : 's'}`}
          sub={others.length ? `${formatPeso(owed)} still owed` : undefined}
        />
        <CheckRow
          ok
          title={`Approved by ${l.approver?.full_name ?? 'an officer'}`}
          sub={[shortDate(l.approved_at), l.disburser?.full_name ? `released by ${l.disburser.full_name} ${shortDate(l.disbursed_at)}` : ''].filter(Boolean).join(' · ') || undefined}
          last
        />
      </Card>
    </>
  );
}

type Step = { title: string; sub?: string; state: 'done' | 'now' | 'next' };

/** Vertical sign-off trail: what's done, the step on this page, and what follows. */
function Steps({ steps }: { steps: Step[] }) {
  return (
    <View>
      {steps.map((st, idx) => {
        const last = idx === steps.length - 1;
        const dot = st.state === 'done' ? intent.success.base : st.state === 'now' ? semantic.brandDark : semantic.surfaceAlt;
        return (
          <View key={st.title} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center', width: 22 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: dot, alignItems: 'center', justifyContent: 'center', borderWidth: st.state === 'next' ? 1 : 0, borderColor: semantic.border }}>
                {st.state === 'done' ? <Check size={12} color="#fff" strokeWidth={3} /> : st.state === 'now' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} /> : null}
              </View>
              {!last ? <View style={{ flex: 1, width: 2, minHeight: 14, backgroundColor: st.state === 'done' ? intent.success.soft : semantic.border }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
              <Text style={{ fontSize: 13.5, lineHeight: 22, fontFamily: st.state === 'now' ? 'Poppins_700Bold' : 'Poppins_500Medium', color: st.state === 'next' ? semantic.textMuted : semantic.textPrimary }}>{st.title}</Text>
              {st.sub ? <Text variant="caption" color="secondary">{st.sub}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Loan release and verify-release: the cash going out, the sign-off trail, and the terms in short. */
function ReleaseDetails({ groupId, i, nameOf }: { groupId: string; i: SignoffItem; nameOf: (memberId?: string | null) => string | null }) {
  const l = i.loan!;
  const summary = useSummary(groupId);
  const releasing = i.action === 'release';

  const amount = Number(l.approved_principal ?? l.principal);
  const interest = totalInterest(l);
  const rate = l.interest_rate != null ? `${+(Number(l.interest_rate) * 100).toFixed(2)}% a month` : null;
  // Same cash on hand as the dashboard: verified cash plus money approved but not yet verified.
  // Only the verified part can be released (group_available_cash, what disburse_loan checks).
  const releasable = Number(summary.data?.available_cash ?? 0);
  const unverified = Number(summary.data?.pending_contributions ?? 0) + Number(summary.data?.pending_loan_repayments ?? 0);
  const cash = releasable + unverified;
  const short = amount - releasable;
  const borrower = (l.membership?.role ?? 'member') as Role;

  const steps: Step[] = [
    { title: `Approved by ${l.approver?.full_name ?? 'an officer'}`, sub: shortDate(l.approved_at), state: 'done' },
    // Only a review that actually happened (older loans) — there's no review step any more.
    ...(l.reviewed_at ? [{ title: `Cleared by ${nameOf(l.reviewed_by) ?? ROLE_NAME[loanRole.review(borrower)]}`, sub: shortDate(l.reviewed_at), state: 'done' as const }] : []),
    releasing
      ? { title: 'Release — you', sub: 'Hand over the cash or send it', state: 'now' }
      : { title: `Released by ${l.disburser?.full_name ?? ROLE_NAME[loanRole.release(borrower)]}`, sub: shortDate(l.disbursed_at), state: 'done' },
    releasing
      ? { title: `${ROLE_NAME[loanRole.verify(borrower)]} verifies`, sub: 'Posts to the ledger', state: 'next' }
      : { title: 'Verify — you', sub: 'Posts to the ledger', state: 'now' },
  ];

  return (
    <>
      {releasing ? (
        <Card style={{ marginTop: 14, paddingVertical: 6 }}>
          {summary.loading ? <ActivityIndicator color={semantic.brand} style={{ marginVertical: 12 }} /> : (
            <>
              <TermRow label="Cash on hand" value={formatPeso(cash)} />
              {unverified > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderColor: semantic.border }}>
                  <Text style={{ fontSize: 12.5, color: intent.info.text }}>Not verified yet — can't be released</Text>
                  <Text style={{ marginLeft: 'auto', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: intent.info.text }}>−{formatPeso(unverified)}</Text>
                </View>
              ) : null}
              <TermRow label="This release" value={`−${formatPeso(amount)}`} />
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
                <Text style={{ fontSize: 12.5, color: short > 0 ? intent.danger.text : semantic.textSecondary }}>{short > 0 ? 'Short by' : 'Left to release'}</Text>
                <Text style={{ marginLeft: 'auto', fontSize: 14, fontFamily: 'Poppins_700Bold', color: short > 0 ? intent.danger.text : semantic.textPrimary }}>{formatPeso(Math.abs(short))}</Text>
              </View>
            </>
          )}
        </Card>
      ) : null}

      {!releasing ? (
        <>
          <Title>Release to verify</Title>
          <Card style={{ paddingVertical: 6 }}>
            <TermRow label="Paid to" value={i.name} />
            <TermRow label="Borrower's role" value={`${ROLE_NAME[borrower]}${l.head_no > 1 ? ` · ${headLabel(l.head_no, l.head_name)}` : ''}`} />
            <TermRow label="Released by" value={l.disburser?.full_name ?? ROLE_NAME[loanRole.release(borrower)]} />
            <TermRow label="Released on" value={dateTime(l.disbursed_at) || '—'} />
            <TermRow label="Amount released" value={formatPeso(amount)} strong last />
          </Card>
          <Text variant="caption" color="secondary" style={{ marginTop: 8 }}>
            Already taken out of cash on hand — the ledger entry is made when you verify.
          </Text>
        </>
      ) : null}

      <Title>Sign-offs</Title>
      <Card><Steps steps={steps} /></Card>

      <Title>Terms</Title>
      <Card style={{ paddingVertical: 6 }}>
        {rate ? <TermRow label="Interest" value={rate} /> : null}
        <TermRow label="Term" value={`${l.term_months} month${l.term_months === 1 ? '' : 's'}`} />
        {l.term_months ? <TermRow label="Monthly payment" value={formatPeso(Math.round(((amount + interest) / l.term_months) * 100) / 100)} /> : null}
        <TermRow label="Total interest" value={formatPeso(interest)} />
        <TermRow label="Total to repay" value={formatPeso(amount + interest)} strong last={!i.note} />
        {i.note ? (
          <View style={{ paddingVertical: 9 }}>
            <Text style={{ fontSize: 12.5, color: semantic.textSecondary }}>Purpose</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 2 }}>{i.note}</Text>
          </View>
        ) : null}
      </Card>
    </>
  );
}

export default function VerifyRecord() {
  const { groupId, key } = useLocalSearchParams<{ groupId: string; key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queue = useSignoffQueue(groupId!);
  const { cycle } = useActiveCycle(groupId!);
  const me = useAuth().member?.id ?? null;
  const myRole = useActiveGroup().membership?.role;
  // Set before a step runs: where to go once it succeeds, instead of back.
  const nextKey = useRef<string | null>(null);
  const actions = useSignoffActions(groupId!, () => {
    if (nextKey.current) router.replace({ pathname: '/(app)/[groupId]/verify/[key]' as any, params: { groupId, key: nextKey.current } });
    else { queue.refetch(); goBack(router); }
  });
  const [rejecting, setRejecting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState(false);
  const readRequested = useRef(false);

  const found = queue.items.find((x) => x.key === key && x.mine);
  // Loan steps carry their loan; if one ever doesn't, load it so the page never shows only a name and amount.
  const loanQ = useLoan(groupId!, found?.kind === 'loan' && !found.loan ? found.id : undefined);
  const fetchedLoan = loanQ.data?.loan;
  const i = found && found.kind === 'loan' && !found.loan && fetchedLoan ? { ...found, loan: fetchedLoan } : found;
  const money = i && (i.kind === 'contribution' || i.kind === 'repayment');

  // Older records were never read: ask the server to read the proof now, once.
  useEffect(() => {
    if (!i || !money || !i.proofUrl || i.reading || readRequested.current) return;
    readRequested.current = true;
    const read = i.kind === 'contribution' ? readContributionProof(groupId!, i.id) : readRepaymentProof(groupId!, i.id);
    read.then(() => queue.refetch()).catch(() => {});
  }, [i, money, groupId, queue]);

  if (!i) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        {/* No title while loading — it would flash before the real one ("Contribution"). */}
        <CloseHeader title={queue.loading ? undefined : 'Record'} onClose={() => goBack(router)} />
        {queue.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40, paddingHorizontal: 24 }}>This one’s already been handled, or it isn’t yours to sign off.</Text>
        )}
      </SafeAreaView>
    );
  }

  const nameOf = (memberId?: string | null) => (memberId ? queue.members.find((m) => m.member_id === memberId)?.members?.full_name ?? null : null);

  function onPrimary() {
    if (!i) return;
    nextKey.current = null;
    if (i.action === 'review' && i.loan) {
      // Cleared: straight on to the release step when it's this officer's, else say who has it.
      const borrower = (i.loan.membership?.role ?? 'member') as Role;
      const releaser = loanRole.release(borrower);
      if (myRole === releaser && i.loan.membership?.member_id !== me) nextKey.current = `ll-${i.id}`;
      else {
        const holder = queue.members.find((m) => m.status === 'active' && m.role === releaser)?.members?.full_name;
        actions.approve(i).then((ok) => { if (ok) toast(`${holder ?? `The ${ROLE_NAME[releaser]}`} releases it next`); });
        return;
      }
    }
    if (i.action === 'release') {
      // Money leaves for real here, with no undo — confirm first.
      Alert.alert('Release these funds?', `${formatPeso(i.amount)} to ${i.name}. It posts to the ledger once the release is verified.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', onPress: () => actions.approve(i) },
      ]);
      return;
    }
    if (i.kind === 'reversal' && i.action === 'verify') {
      // UC-LG-02 step 4: optional notes for the Organizer.
      setVerifyNotes(true);
      return;
    }
    actions.approve(i);
  }

  const match = money ? itemMatch(i) : null;
  const fields = match && 'fields' in match ? match.fields : [];
  const allMatch = match?.kind === 'match' && fields.every((f) => f.state === 'match');

  // Rule check (contributions): heads × the cycle's contribution = what's due.
  const heads = queue.members.find((m) => m.id === i.membershipId)?.heads ?? 1;
  const due = i.kind === 'contribution' && cycle && (!i.cycleId || i.cycleId === cycle.id) ? heads * Number(cycle.contribution_amount) : null;
  const dueOk = due != null && i.amount != null && Math.abs(Number(i.amount) - due) < 0.5;
  const periodLabel = i.recordedAt ? new Date(i.recordedAt).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <CloseHeader title={i.label} onClose={() => goBack(router)} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{i.name}</Text>
        {i.amount !== null ? <Text style={{ fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>{formatPeso(i.amount)}</Text> : null}
        {money && recordedLine(i) ? <Text variant="caption" color="secondary">{recordedLine(i)}</Text> : null}
        {i.loan ? (
          <Text variant="caption" color="secondary">
            {ROLE_NAME[(i.loan.membership?.role ?? 'member') as Role]}{i.loan.head_no > 1 ? ` · ${headLabel(i.loan.head_no, i.loan.head_name)}` : ''} · applied {shortDate(i.loan.applied_at)}
          </Text>
        ) : null}

        {stepNote(i) ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: intent.info.soft, borderRadius: 12, padding: 11, marginTop: 12 }}>
            <Info size={14} color={intent.info.text} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: intent.info.text }}>{stepNote(i)}</Text>
          </View>
        ) : null}

        {money ? (
          <>
            {/* Recorded vs read from proof */}
            <Card style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>Recorded</Text>
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>Read from proof</Text>
              </View>
              {match?.kind === 'no_proof' ? (
                <Text variant="caption" style={{ color: intent.danger.text, paddingVertical: 8 }}>No proof attached — check this one against the cash slip or receipt number.</Text>
              ) : match?.kind === 'pending' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color={semantic.brand} />
                  <Text variant="caption" color="secondary">Reading the proof…</Text>
                </View>
              ) : (
                <>
                  {fields.map((f, idx) => <CompareRow key={f.key} f={f} last={idx === fields.length - 1} />)}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderStyle: 'dashed', borderColor: semantic.border }}>
                    {match?.kind === 'mismatch' ? <X size={14} color={intent.danger.text} strokeWidth={3} /> : <Check size={14} color={allMatch ? intent.success.text : semantic.textMuted} strokeWidth={3} />}
                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: match?.kind === 'mismatch' ? intent.danger.text : allMatch ? intent.success.text : semantic.textSecondary }}>
                      {match?.kind === 'mismatch'
                        ? `${match.count} field${match.count === 1 ? '' : 's'} ${match.count === 1 ? "doesn't" : "don't"} match the proof`
                        : allMatch ? `All ${fields.length} fields match the proof`
                          : match?.kind === 'match' ? 'The fields read match — check the rest by eye' : "The proof couldn't be read — check it by eye"}
                    </Text>
                  </View>
                </>
              )}
            </Card>

            {/* The proof itself */}
            {i.proofUrl ? (
              <>
                <Title>Uploaded proof</Title>
                <Card>
                  <Pressable onPress={() => setViewing(true)} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: semantic.surfaceAlt }}>
                    <Image source={{ uri: i.proofUrl }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
                  </Pressable>
                  {fields.some((f) => f.state !== 'unread') ? (
                    <View style={{ marginTop: 12 }}>
                      {fields.filter((f) => f.state !== 'unread').map((f) => (
                        <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderColor: semantic.border }}>
                          <Text style={{ fontSize: 12.5, color: semantic.textSecondary }}>{f.label === 'Paid by' ? 'Sent by' : f.label}</Text>
                          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{f.read}</Text>
                          </View>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                        <ScanLine size={12} color={semantic.textMuted} />
                        <Text variant="caption" color="muted" style={{ flex: 1 }}>Outlined fields were read automatically from the uploaded proof.</Text>
                      </View>
                    </View>
                  ) : null}
                </Card>
              </>
            ) : null}

            {/* Rule check */}
            {due != null ? (
              <>
                <Title>Rule check</Title>
                <Card>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dueOk ? intent.success.soft : intent.danger.base, marginTop: 1 }}>
                      {dueOk ? <Check size={12} color={intent.success.text} strokeWidth={3} /> : <X size={12} color="#fff" strokeWidth={3} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{dueOk ? 'Matches what is due' : "Doesn't match what is due"}</Text>
                      <Text variant="caption" style={{ color: dueOk ? semantic.textSecondary : intent.danger.text, marginTop: 1 }}>
                        {heads} head{heads === 1 ? '' : 's'} × {formatPeso(cycle!.contribution_amount)} = {formatPeso(due)}{periodLabel ? ` for ${periodLabel}` : ''}
                      </Text>
                    </View>
                  </View>
                </Card>
              </>
            ) : null}
          </>
        ) : i.loan ? (
          i.action === 'review' ? <LoanDetails groupId={groupId!} i={i} /> : <ReleaseDetails groupId={groupId!} i={i} nameOf={nameOf} />
        ) : (
          i.note ? (
            <Card style={{ marginTop: 14 }}>
              <Text variant="caption" color="secondary" style={{ marginBottom: 4 }}>{i.kind === 'reversal' ? 'Reason for the reversal' : i.kind === 'withdrawal' ? 'Settlement' : 'Purpose'}</Text>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: semantic.textPrimary }}>{i.note}</Text>
            </Card>
          ) : null
        )}

        {i.kind === 'reversal' && i.entryId ? (
          <ReversalEntryCard
            groupId={groupId!}
            entryId={i.entryId}
            onOpen={() => router.push({ pathname: '/(app)/[groupId]/ledger/[entryId]' as any, params: { groupId, entryId: i.entryId! } })}
          />
        ) : null}

        {!i.proofUrl && money ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
            <Receipt size={13} color={semantic.textMuted} />
            <Text variant="caption" color="muted">{i.reference ? `Receipt no. ${i.reference}` : 'No receipt number'}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Reject / step */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4, flexDirection: 'row', gap: 10 }}>
        {canSendBack(i) ? (
          <Pressable onPress={() => setRejecting(true)} disabled={actions.busy} style={{ flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: semantic.surface, borderWidth: 1, borderColor: intent.danger.soft }}>
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>{sendBackLabel(i)}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onPrimary} disabled={actions.busy} style={{ flex: 1.6, paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: semantic.brandDark, opacity: actions.busy ? 0.6 : 1 }}>
          {actions.busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{i.action === 'release' && i.amount != null ? `Release ${formatPeso(i.amount)}` : primaryLabel(i)}</Text>}
        </Pressable>
      </View>

      <ReasonPrompt
        visible={rejecting}
        title={i.action === 'review' ? `Send ${i.name}'s loan back?` : `Reject ${i.name}'s ${i.label.toLowerCase()}?`}
        placeholder={i.action === 'review' ? 'Why it needs another look (required)' : i.kind === 'contribution' || i.kind === 'repayment' ? 'What needs to be fixed? (shown to them)' : 'Reason (shown to them)'}
        confirmLabel={sendBackLabel(i)}
        destructive
        required={i.kind === 'contribution' || i.kind === 'repayment' || i.kind === 'reversal'}
        onCancel={() => setRejecting(false)}
        onConfirm={(reason) => { setRejecting(false); actions.sendBack(i, reason); }}
      />
      <ReasonPrompt
        visible={verifyNotes}
        title="Verify this reversal?"
        placeholder="Notes for the Organizer (optional)"
        confirmLabel="Verify"
        onCancel={() => setVerifyNotes(false)}
        onConfirm={(notes) => { setVerifyNotes(false); actions.approve(i, notes); }}
      />
      <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewing(false)}>
          {i.proofUrl ? <Image source={{ uri: i.proofUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
