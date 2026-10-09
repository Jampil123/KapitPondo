import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { View, ScrollView, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import {
  Check, Clock3, AlertTriangle, RotateCcw, CalendarClock, Users, Smartphone,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { semantic, intent } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { parseApiDate } from '@/lib/cycle';
import { buildContributionReference } from '@/lib/qrPh';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { signoffRoles, progressSteps } from '@/features/signoff/signoff';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions, useSubmitContribution } from '@/features/contributions/contributions.hooks';
import { availableCredit, buildTimeline } from '@/features/contributions/periods';
import { usePenaltyDue } from '@/features/contributions/penalty';
import { useQuery } from '@/hooks/useApi';
import { listOfficers } from '@/api/groups';
import { useProofScan, confirmSubmitDespiteDuplicate } from '@/features/contributions/useProofScan';
import {
  AmountBlock, Badge, BlockedState, CloseHeader, GcashDetails, PaymentForm, SectionHead, SuccessView, formatDateTime,
} from '@/features/payments/PaymentPage';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import type { Contribution } from '@/api/contributions';

type PageState = 'submit' | 'overdue' | 'review' | 'rejected';

function shortDate(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : parseApiDate(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function contributionSuccessRows(receipt: Receipt): { label: string; value: ReactNode }[] {
  return [
    { label: 'Status', value: <Badge tone="info" label="Under review" Icon={Clock3} /> },
    { label: 'For', value: receipt.dueDate ? `${receipt.cycleName} · due ${shortDate(receipt.dueDate)}` : receipt.cycleName },
    ...(receipt.recipient ? [{ label: 'Sent to', value: receipt.recipient }] : []),
    ...(receipt.reference ? [{ label: 'Reference', value: receipt.reference }] : []),
    { label: 'Submitted', value: formatDateTime(receipt.submittedAt) },
  ];
}

function ProofThumb({ path, title, sub }: { path: string | null; title: string; sub: string }) {
  const url = useSignedProofUrl(path);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

/** What the member just sent, captured at submit time so the success page doesn't depend on the refetched data. */
type Receipt = {
  amount: string;
  reference: string;
  submittedAt: Date;
  cycleName: string;
  dueDate: Date | null;
  recipient: string | null;
  resubmitted: boolean;
};

export default function Contribute() {
  // `id` opens one specific row from the history list (features/contributions/periods.ts
  // builds these); `due` is passed instead when the list computed a period as
  // overdue with no backing row yet — the server only creates a 'late' row lazily,
  // and only when an officer (not the member) views the list, so a member can be
  // genuinely overdue with nothing in the database to point `id` at.
  const { groupId, id: rowId, due: dueParam, from } = useLocalSearchParams<{ groupId: string; id?: string; due?: string; from?: string }>();
  // Reached from the contributions list itself, "View all my contributions" would just point back at the page the member
  // came from — only worth showing when this screen was opened some other way (the dashboard's standing card, a shortcut).
  const showViewAll = from !== 'contributions';
  const router = useRouter();
  const { membership, group } = useActiveGroup();
  const { refresh: refreshGroups } = useGroups();
  const { cycle, loading: cycleLoading } = useActiveCycle(groupId!);
  const contribs = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const submit = useSubmitContribution(groupId!);
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);
  // Both are needed: the Treasurer confirms receipt, the Auditor verifies and posts.
  const missingOfficers = (['treasurer', 'auditor'] as const)
    .filter((r) => !officers.data?.officers.some((o) => o.role === r))
    .map((r) => (r === 'treasurer' ? 'Treasurer' : 'Auditor'));
  const noOfficers = !officers.loading && missingOfficers.length > 0;
  const noOfficersText = `This group has no ${missingOfficers.join(' or ')} yet. Contributions open once the Organizer appoints one.`;

  const rows = (contribs.data ?? []).filter((c: Contribution) => c.membership_id === membership?.id);
  const heads = membership?.heads ?? 1;
  // Same "current period" rule as MemberDashboard's StandingCard — the first
  // not-yet-paid entry, or the last period if everything's paid. Deliberately
  // NOT "the most recent row regardless of status": a resubmission after a
  // rejection inserts a NEW row rather than editing the old one, so picking
  // by raw recency kept surfacing the superseded rejected row even after the
  // resubmission was approved (buildTimeline already collapses that).
  const timeline = cycle ? buildTimeline(cycle, rows, heads) : [];
  const picked = rowId ? (rows.find((r) => r.id === rowId) ?? null) : null;
  const entry = picked
    ? (timeline.find((p) => p.row?.id === picked.id || p.topUp?.id === picked.id) ?? null)
    : (timeline.find((p) => p.kind !== 'paid') ?? timeline[timeline.length - 1] ?? null);
  // A period paid before heads went up still owes the difference — paying it
  // is a top-up, and the screen follows that top-up's own row (0068).
  const balanceDue = entry?.balance ?? 0;
  const current = balanceDue
    ? (picked && picked.id !== entry!.row?.id ? picked : entry!.topUp)
    : (picked ?? entry?.row ?? null);
  const loading = cycleLoading || contribs.loading;
  const expected = cycle ? Number(cycle.contribution_amount) * heads : 0;
  // Advance credit from paying before heads went down covers part or all of the next period.
  const credit = availableCredit(membership?.contribution_credit, rows);
  const periodDue = Number(current?.amount ?? expected);
  const creditUse = balanceDue ? 0
    : current?.status === 'rejected' ? Number(current.credit_applied ?? 0)
    : Math.min(credit, periodDue);
  const baseAmount = balanceDue
    ? (current?.status === 'rejected' ? Number(current.amount) : balanceDue)
    : current?.status === 'rejected' ? periodDue : Math.max(periodDue - creditUse, 0);
  const due = current?.due_date ? parseApiDate(current.due_date) : dueParam ? new Date(dueParam) : balanceDue ? entry!.dueDate : null;
  const now = new Date();

  const state: PageState =
    current?.status === 'submitted' || current?.status === 'confirmed' ? 'review' :
    current?.status === 'rejected' ? 'rejected' :
    current?.is_late && due ? 'overdue' :
    !current && due && due < now ? 'overdue' :
    'submit';

  // Late: the transfer covers the contribution plus the late penalty; the API splits the two back apart.
  // A top-up only pays the balance — any late penalty goes with the next regular contribution.
  const penaltyDue = usePenaltyDue(groupId!, cycle, baseAmount, state === 'overdue' && !balanceDue, rows);
  const payAmount = baseAmount + penaltyDue;
  // Nothing to send: the server marks the period paid from credit on the spot.
  const coveredByCredit = !balanceDue && (state === 'submit' || state === 'overdue') && creditUse > 0 && baseAmount <= 0;

  // Paying needs the group's Owner to have set a treasurer GCash number
  // (see group/settings.tsx) — without it the screen below is blocked outright.
  const hasTreasurerGcash = !!group?.treasurer_gcash_number;
  const [amount, setAmount] = useState('');

  // The amount sent must be exactly what's due — contribution × heads (less credit),
  // with or without the late penalty, or the exact balance for a top-up. The API enforces the same.
  const requiredAmount = state === 'rejected' && current
    ? Number(current.amount) + Number(current.penalty_applied ?? 0)
    : payAmount;
  const enteredAmount = toAmountString(amount) ? Number(toAmountString(amount)) : null;
  const amountMatches = enteredAmount !== null
    && (Math.abs(enteredAmount - requiredAmount) < 0.005 || (!balanceDue && Math.abs(enteredAmount - baseAmount) < 0.005));
  const amountError = !amount.trim() || amountMatches ? undefined
    : balanceDue ? `Enter exactly ${formatPeso(requiredAmount)} — the balance still due for this month.`
    : `Enter exactly ${formatPeso(requiredAmount)} — ${heads} head${heads === 1 ? '' : 's'} × ${formatPeso(cycle?.contribution_amount ?? 0)}${creditUse ? `, less ${formatPeso(creditUse)} credit` : ''}${requiredAmount > baseAmount ? ', plus the late penalty' : ''}.`;
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const { scanning, flags, scanMeta, scanProof, reset: resetScan } = useProofScan({
    groupId,
    expectedAmount: payAmount,
    treasurerGcashNumber: group?.treasurer_gcash_number,
    onFields: (fields) => {
      if (fields.amount) setAmount(fields.amount);
      if (fields.reference) setReference(fields.reference);
    },
  });

  // Keyed on the due date's timestamp, not the Date object — `due` is rebuilt every render, and the `new Date()` fallback is deliberately left out.
  const dueTime = due?.getTime();
  const qrReference = useMemo(
    () => (group && membership ? buildContributionReference({ fundCode: group.fund_code, membershipId: membership.id, when: dueTime ? new Date(dueTime) : new Date() }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group?.fund_code, membership?.id, dueTime],
  );

  // The last amount filled in automatically — replaced when the penalty loads, but never once the member (or the proof scan) changes it.
  const autoAmount = useRef('');
  useEffect(() => {
    if (loading) return;
    if (state === 'rejected' && current) {
      setAmount(String(Number(current.amount) + Number(current.penalty_applied ?? 0)));
      setReference(current.external_reference ?? '');
    } else if ((state === 'submit' || state === 'overdue') && cycle && (!amount || amount === autoAmount.current)) {
      autoAmount.current = payAmount.toFixed(2);
      setAmount(autoAmount.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, state, cycle?.id, current?.id, payAmount]);

  async function copyValue(key: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 1500);
  }

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const uri = res.assets[0].uri;
    setProofUri(uri);
    resetScan();
    scanProof(uri);
  }

  async function onUseCredit() {
    if (!cycle) return;
    const ok = await submit.run({ cycle_id: cycle.id, amount: '0' });
    if (ok !== undefined) {
      await refreshGroups();
      router.replace({ pathname: '/(app)/[groupId]/contributions' as any, params: { groupId } });
    } else if (submit.error) {
      Alert.alert('Could not apply credit', submit.error.message);
    }
  }

  async function onSubmit() {
    if (!cycle) return Alert.alert('No active cycle', 'There is no active cycle to contribute to yet.');
    if (noOfficers) return Alert.alert('Officers not appointed', noOfficersText);
    if (!hasTreasurerGcash) return Alert.alert('No GCash number set up', "The treasurer hasn't set up a verified GCash number yet. Check back once one has been approved before submitting.");
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter a valid contribution amount.');
    if (amountError) return Alert.alert('Amount doesn\'t match', amountError);
    if (!proofUri) return Alert.alert('Proof required', 'Attach a photo or screenshot of your payment before submitting.');

    if (groupId) {
      const proceed = await confirmSubmitDespiteDuplicate(groupId, reference, !!flags);
      if (!proceed) return;
    }

    setUploading(true);
    try {
      const proof_url = await uploadImage('proofs', proofUri, 'contribution');
      const ok = await submit.run({
        cycle_id: cycle.id,
        amount: amt,
        payment_method: state === 'rejected' ? undefined : 'gcash',
        external_reference: reference || undefined,
        proof_url,
      });
      if (ok !== undefined) {
        setReceipt({
          amount: amt,
          reference: reference.trim(),
          submittedAt: new Date(),
          cycleName: cycle.name,
          dueDate: due,
          recipient: state === 'rejected' ? null : [group?.treasurer_gcash_name, group?.treasurer_gcash_number].filter(Boolean).join(' · ') || null,
          resubmitted: state === 'rejected',
        });
      } else if (submit.error) {
        Alert.alert('Could not submit', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const TITLES: Record<PageState, string> = {
    submit: 'Submit contribution',
    overdue: 'Submit contribution',
    review: 'Contribution status',
    rejected: 'Resubmit proof',
  };
  const title = TITLES[state];
  const close = () => router.back();

  if (receipt) {
    return (
      <SuccessView
        heading={receipt.resubmitted ? 'Contribution resubmitted' : 'Contribution submitted'}
        amount={receipt.amount}
        note="An officer will confirm it. You'll be notified once it's posted."
        rows={contributionSuccessRows(receipt)}
        onClose={close}
        viewAllLabel="View my contributions"
        onViewAll={() => router.replace({ pathname: '/(app)/[groupId]/contributions' as any, params: { groupId } })}
      />
    );
  }

  // `&& !cycle`, not just `loading` — useQuery's background refetch (e.g. the
  // AppState-triggered one that fires the instant the native image picker
  // hands control back, see useApi.ts) sets loading=true on every foreground
  // return while deliberately KEEPING the previous cycle/contribs data. Gating
  // on loading alone would unmount this whole screen — including whatever photo
  // the member just attached — every single time. Once cycle has loaded once,
  // a later refetch should update this screen in place, not tear it down.
  //
  // `awaitingFirstLoad` covers the other half: until contributions have loaded
  // once, `current` is null, so the page would render as "Submit contribution" for a
  // moment and then flip to "Contribution status" (or "Resubmit proof"). Data is kept
  // across refetches, so this only holds the very first paint.
  const awaitingFirstLoad = contribs.data === null && contribs.loading;
  if ((loading && !cycle) || awaitingFirstLoad) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="" onClose={close} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!cycle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Submit contribution" onClose={close} />
        <BlockedState
          icon={CalendarClock}
          tone="info"
          title="No active cycle yet"
          body="This group doesn't have an active contribution cycle right now. Check back once the organizer starts one."
        />
      </SafeAreaView>
    );
  }

  if (noOfficers && (state === 'submit' || state === 'overdue')) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Submit contribution" onClose={close} />
        <BlockedState
          icon={Users}
          tone="warning"
          title="Officers not appointed"
          body={noOfficersText}
        />
      </SafeAreaView>
    );
  }

  // Blocks ALL payment methods here (not just GCash) — without a verified GCash
  // number there's no confirmed treasurer to reconcile against yet.
  if (!hasTreasurerGcash && (state === 'submit' || state === 'overdue')) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Submit contribution" onClose={close} />
        <BlockedState
          icon={Smartphone}
          tone="warning"
          title="No GCash number set up"
          body="The treasurer hasn't set up a verified GCash number yet, so payments can't be recorded or confirmed. Check back once one has been approved."
        />
      </SafeAreaView>
    );
  }

  const canPay = state === 'submit' || state === 'overdue';
  const busy = submit.loading || uploading;
  const diff = due ? daysBetween(due, now) : null;
  const lateDays = due ? Math.abs(daysBetween(due, now)) : 0;
  const breakdown = `${heads} head${heads === 1 ? '' : 's'} × ${formatPeso(cycle.contribution_amount)}`;
  const amountLabel = balanceDue ? 'Balance due' : 'Amount due';
  const amountNote = balanceDue
    ? `Heads went up after you paid · ${formatPeso(entry!.amount)} due, ${formatPeso(entry!.amount - balanceDue)} paid`
    : creditUse > 0 ? `${breakdown} − ${formatPeso(creditUse)} advance credit` : breakdown;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title={title} onClose={close} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

          {coveredByCredit ? (
            <AmountBlock
              label="Amount due"
              amount={periodDue}
              badge={<Badge tone="success" label="Covered by credit" Icon={Check} />}
              meta={<>{cycle.name}{due ? <> · due <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(due)}</Text></> : ''}</>}
              note={`Paid from your ${formatPeso(credit)} advance credit · nothing to send`}
            />
          ) : null}

          {state === 'submit' && !coveredByCredit && (
            <AmountBlock
              label={amountLabel}
              amount={payAmount}
              badge={<Badge tone="success" label="On time" Icon={Check} />}
              meta={<>{cycle.name}{due ? <> · due <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(due)}</Text>{diff !== null && diff >= 0 ? ` · ${diff} day${diff === 1 ? '' : 's'} left` : ''}</> : ' · no due date set'}</>}
              note={amountNote}
              copied={copiedField === 'amount'}
              onCopy={() => copyValue('amount', payAmount.toFixed(2))}
            />
          )}

          {state === 'overdue' && !coveredByCredit && (
            <AmountBlock
              label={amountLabel}
              amount={payAmount}
              badge={<Badge tone="danger" label={`${lateDays} day${lateDays === 1 ? '' : 's'} late`} Icon={AlertTriangle} />}
              meta={<>{cycle.name} · was due <Text style={{ fontWeight: '700', color: intent.danger.text }}>{shortDate(due)}</Text></>}
              note={penaltyDue ? `${amountNote} + ${formatPeso(penaltyDue)} late penalty` : amountNote}
              copied={copiedField === 'amount'}
              onCopy={() => copyValue('amount', payAmount.toFixed(2))}
            />
          )}

          {state === 'review' && current && (
            <AmountBlock
              label="Submitted"
              amount={Number(current.amount) + Number(current.penalty_applied ?? 0)}
              badge={<Badge tone="info" label="Under review" Icon={Clock3} />}
              meta={<>Sent <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(current.created_at)}</Text>{current.external_reference ? ` · ref ${current.external_reference}` : ''}</>}
              note={Number(current.penalty_applied) > 0 ? `${cycle.name} · incl. ${formatPeso(current.penalty_applied)} late penalty` : cycle.name}
            />
          )}

          {state === 'rejected' && current && (
            <AmountBlock
              label="Still unpaid"
              amount={current.amount}
              badge={<Badge tone="danger" label="Needs resubmission" Icon={AlertTriangle} />}
              meta={<>{cycle.name}{due ? <> · was due <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{shortDate(current.due_date)}</Text></> : ''}</>}
              note={`Returned ${shortDate(current.updated_at)}`}
            />
          )}

          {canPay && !coveredByCredit && (
            <>
              <GcashDetails
                qrPath={group?.treasurer_gcash_qr_url}
                recipientName={group?.treasurer_gcash_name || 'Treasurer GCash'}
                number={group?.treasurer_gcash_number ?? ''}
                reference={qrReference}
                copiedField={copiedField}
                onCopy={copyValue}
              />
              <PaymentForm
                amount={amount} setAmount={setAmount}
                reference={reference} setReference={setReference}
                proofUri={proofUri} pickProof={pickProof} scanning={scanning}
                flags={flags} scanMeta={scanMeta} dueAmountLabel={formatPeso(payAmount)} amountError={amountError}
              />
            </>
          )}

          {state === 'review' && current && (
            <>
              <SectionHead title="Progress" />
              <View style={{ gap: 4 }}>
                {progressSteps(current, signoffRoles(membership?.role), 'Counts towards your capital and year-end share', shortDate).map((s, i, arr) => (
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
                      {i < arr.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: s.done ? intent.success.base : semantic.border, marginTop: 2 }} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 16 }}>
                      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: s.now ? intent.info.text : s.done ? semantic.textPrimary : semantic.textMuted }}>{s.title}</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 16 }}>{s.sub}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <SectionHead title="What you sent" />
              {current.proof_url ? (
                <ProofThumb path={current.proof_url} title="Proof of payment" sub={`Uploaded ${shortDate(current.created_at)}`} />
              ) : (
                <Text variant="body" color="muted">No proof attached to this submission.</Text>
              )}
            </>
          )}

          {state === 'rejected' && current && (
            <>
              <SectionHead title="Why it was returned" />
              <View style={{ borderLeftWidth: 3, borderColor: intent.danger.base, paddingLeft: 12 }}>
                <Text style={{ fontSize: 13, lineHeight: 19, color: '#8E3227', fontWeight: '600' }}>
                  {current.rejection_reason ?? 'No reason was given — ask an officer for details.'}
                </Text>
              </View>

              {current.proof_url ? (
                <>
                  <SectionHead title="What you sent before" />
                  <ProofThumb path={current.proof_url} title="Previous proof" sub={`Returned ${shortDate(current.updated_at)}`} />
                </>
              ) : null}

              <PaymentForm
                amount={amount} setAmount={setAmount}
                reference={reference} setReference={setReference}
                proofUri={proofUri} pickProof={pickProof} scanning={scanning}
                flags={flags} scanMeta={scanMeta} dueAmountLabel={formatPeso(payAmount)} amountError={amountError}
              />
            </>
          )}
        </ScrollView>

        {(state !== 'review' || showViewAll) && (
          <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: semantic.background }}>
            {state === 'review' ? (
              <Button
                label="View all my contributions"
                variant="ghost"
                onPress={() => router.replace({ pathname: '/(app)/[groupId]/contributions' as any, params: { groupId } })}
              />
            ) : coveredByCredit ? (
              <Button label="Use credit" leading={<Check size={16} color="#fff" />} onPress={onUseCredit} loading={submit.loading} />
            ) : (
              <Button
                label={state === 'rejected' ? 'Resubmit for review' : 'Submit contribution'}
                leading={state === 'rejected' ? <RotateCcw size={16} color="#fff" /> : undefined}
                onPress={onSubmit}
                loading={busy}
                disabled={!proofUri || !!amountError}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
