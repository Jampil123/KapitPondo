import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, AlertTriangle, Lock, CalendarCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/constants/roles';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { usePenalties } from '@/features/penalties/penalties.hooks';
import {
  useDistributions, useDistribution, usePreviewDistribution, useVerifyDistribution, useUnverifyDistribution, useReturnDistribution, useFinalizeDistribution, useCancelDistribution,
  useSubmitDistribution, useDistributionReadiness, useLedgerCheck, useDistributionEstimate,
} from '@/features/distribution/distribution.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import type { Distribution, LedgerCheck } from '@/api/distribution';


function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function shortDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${shortDate(iso)}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
}

function StatusPill({ status }: { status: string | null }) {
  const meta = getStatusMeta('distribution', status ?? undefined);
  const tone = intent[meta.intent];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tone.soft, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 20 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone.base }} />
      <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: tone.text }}>{meta.label}</Text>
    </View>
  );
}

type GateState = 'done' | 'now' | 'wait';

/** Horizontal stepper — each step's circle joined to the next by a line that turns green once reached. */
function Gates({ steps }: { steps: { state: GateState; label: string; sub?: string }[] }) {
  const reached = (idx: number) => steps[idx] && steps[idx].state !== 'wait';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {steps.map((st, idx) => (
        <View key={st.label} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
            <View style={{ flex: 1, height: 2, backgroundColor: idx === 0 ? 'transparent' : reached(idx) ? intent.success.base : semantic.border }} />
            <View style={{
              width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
              backgroundColor: st.state === 'done' ? intent.success.base : st.state === 'now' ? '#2FA8FF' : semantic.surfaceAlt,
            }}>
              {st.state === 'done' ? <Check size={12} color="#fff" strokeWidth={3} /> : (
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: st.state === 'now' ? '#fff' : semantic.textMuted }}>{idx + 1}</Text>
              )}
            </View>
            <View style={{ flex: 1, height: 2, backgroundColor: idx === steps.length - 1 ? 'transparent' : reached(idx + 1) ? intent.success.base : semantic.border }} />
          </View>
          <Text style={{ marginTop: 8, paddingHorizontal: 4, textAlign: 'center', fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_500Medium', color: st.state === 'wait' ? semantic.textMuted : semantic.textPrimary }}>
            {st.label}
          </Text>
          {st.sub ? <Text variant="caption" color="secondary" style={{ marginTop: 2, textAlign: 'center', fontSize: 10.5 }}>{st.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function TotalRow({ label, value, note, bold, minus }: { label: string; value: number; note?: string; bold?: boolean; minus?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4, gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text variant={bold ? 'label' : 'caption'} color={bold ? undefined : 'secondary'} style={{ fontSize: bold ? 13.5 : 12.5 }}>{label}</Text>
        {note ? <Text variant="caption" color="muted" style={{ fontSize: 11 }}>{note}</Text> : null}
      </View>
      <Text style={{ fontSize: bold ? 16 : 13.5, fontFamily: 'Poppins_700Bold', color: minus && value > 0 ? intent.danger.text : semantic.textPrimary }}>
        {minus && value > 0 ? '−' : ''}{formatPeso(value)}
      </Text>
    </View>
  );
}

// UC-YD-01 steps 2–3: capital, net income, share per head, deductions, total payout.
type TotalsShape = Pick<Distribution, 'capital_total' | 'net_income' | 'interest_income' | 'penalty_income' | 'deductions_total' | 'total_heads' | 'total_amount'>;

function Totals({ d }: { d: TotalsShape }) {
  const net = Number(d.net_income ?? 0);
  const interest = Number(d.interest_income ?? 0);
  const penalty = Number(d.penalty_income ?? 0);
  const other = net - interest - penalty;
  const heads = Number(d.total_heads ?? 0);
  const parts = [`interest ${formatPeso(interest)}`, `penalties ${formatPeso(penalty)}`];
  if (Math.abs(other) >= 0.01) parts.push(`other ${formatPeso(other)}`);
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, marginTop: 16 }, shadowToken.soft]}>
      <TotalRow label="Capital" value={Number(d.capital_total ?? 0)} note="Members' contributions this cycle" />
      <TotalRow label="Net income" value={net} note={parts.join(' · ')} />
      <TotalRow label="Share per head" value={heads > 0 ? net / heads : 0} note={`${formatPeso(net)} ÷ ${heads} head${heads === 1 ? '' : 's'}`} />
      <TotalRow label="Deductions" value={Number(d.deductions_total ?? 0)} note="Unpaid loans and penalties" minus />
      <View style={{ borderTopWidth: 1, borderColor: semantic.border, marginTop: 4, paddingTop: 4 }}>
        <TotalRow label="Total payout" value={Number(d.total_amount)} bold />
      </View>
    </View>
  );
}

// UC-YD-02 steps 2-3, E1: each figure next to the ledger's, differences in red.
function LedgerCompare({ check }: { check: LedgerCheck }) {
  const ok = check.matches;
  const tone = ok ? intent.success : intent.danger;
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 18, padding: 14, marginTop: 14 }, shadowToken.soft]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
          {ok ? <Check size={12} color={tone.text} strokeWidth={3} /> : <AlertTriangle size={12} color={tone.text} />}
        </View>
        <Text variant="label" style={{ flex: 1, fontSize: 13, color: tone.text }}>
          {ok ? 'Matches the ledger' : "Doesn't match the ledger"}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
        <Text variant="caption" color="muted" style={{ flex: 1 }}> </Text>
        <Text variant="caption" color="muted" style={{ width: 96, textAlign: 'right' }}>Preview</Text>
        <Text variant="caption" color="muted" style={{ width: 96, textAlign: 'right' }}>Ledger</Text>
      </View>
      {[...check.totals, ...check.members].map((r, i) => {
        const bad = r.kind === 'member' || !!r.differs;
        const color = bad ? intent.danger.text : semantic.textPrimary;
        return (
          <View key={`${r.kind}-${r.item}-${r.membership_id ?? i}`} style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4, borderTopWidth: r.kind === 'member' && i === check.totals.length ? 1 : 0, borderColor: semantic.border }}>
            <Text variant="caption" style={{ flex: 1, color: bad ? intent.danger.text : semantic.textSecondary }} numberOfLines={1}>{r.label}</Text>
            <Text style={{ width: 96, textAlign: 'right', fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color }}>{formatPeso(r.preview_amount)}</Text>
            <Text style={{ width: 96, textAlign: 'right', fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color }}>{formatPeso(r.ledger_amount)}</Text>
          </View>
        );
      })}
      {!ok ? (
        <Text variant="caption" color="secondary" style={{ marginTop: 8, lineHeight: 16 }}>
          Something changed after the Treasurer prepared this. Return it so they can prepare it again.
        </Text>
      ) : null}
    </View>
  );
}

export default function YearEnd() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { role } = useActiveGroup();
  const { member } = useAuth();
  const summary = useSummary(groupId!);
  const distributions = useDistributions(groupId!);
  const pendingPenalties = usePenalties(groupId!, 'pending');
  const preview = usePreviewDistribution(groupId!);
  const verify = useVerifyDistribution(groupId!);
  const unverify = useUnverifyDistribution(groupId!);
  const returnBack = useReturnDistribution(groupId!);
  const [returning, setReturning] = useState(false);
  const finalize = useFinalizeDistribution(groupId!);
  const cancel = useCancelDistribution(groupId!);
  const submit = useSubmitDistribution(groupId!);
  const isTreasurer = can(role, 'previewDistribution');
  const readiness = useDistributionReadiness(groupId!, isTreasurer);
  const blockers = readiness.data ?? [];


  // The most recent in-flight distribution, or failing that the most recent
  // one at all (finalized) — so a past distribution stays visible as the
  // record instead of the screen going blank once it's locked.
  const sorted = useMemo(
    () => [...(distributions.data ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [distributions.data],
  );
  const current = sorted.find((d) => d.status !== 'finalized') ?? sorted[0] ?? null;
  const detail = useDistribution(groupId!, current?.id);
  const allocations = detail.data?.allocations ?? [];

  const draft = current?.status === 'draft';
  const previewed = current?.status === 'previewed';
  const verified = current?.status === 'verified';
  const finalized = current?.status === 'finalized';
  const returned = current?.status === 'returned';

  const ledger = useLedgerCheck(
    groupId!, current?.id,
    (role === 'auditor' || role === 'owner') && (previewed || verified) && current?.capital_total != null,
  );
  const ledgerMismatch = !!ledger.data && !ledger.data.matches;
  const movedMembers = new Set((ledger.data?.members ?? []).map((m) => m.membership_id));
  const [verifying, setVerifying] = useState(false);

  // What's on screen: the distribution in progress (or this cycle's finalized one).
  // With none, officers see a live estimate of the split instead (nothing saved).
  const { cycle: activeCycle } = useActiveCycle(groupId!);
  const inFlight = draft || previewed || verified;
  const finalizedThisCycle = finalized && (!activeCycle || current?.cycle_id === activeCycle.id);
  const record = inFlight || finalizedThisCycle ? current : null;
  const isOfficer = role === 'owner' || role === 'treasurer' || role === 'auditor';
  const showEstimate = isOfficer && !!activeCycle && !record;
  const estimate = useDistributionEstimate(groupId!, showEstimate);
  const router = useRouter();
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [promptClose, setPromptClose] = useState(false);

  const cashNow = Number(summary.data?.available_cash ?? 0);
  const cashAtPreview = current ? Number(current.total_amount) : 0;
  // Same tolerance finalize_distribution enforces server-side (migration 0028) —
  // surfaced here before the tap instead of only as a 409 after.
  const fundChanged = !!current && !finalized && Math.abs(cashNow - cashAtPreview) > 0.01;

  const pendingPenaltyCount = pendingPenalties.data?.length ?? 0;
  const totalHeads = allocations.reduce((s, a) => s + (a.memberships?.heads ?? 0), 0);

  async function onPreview() {
    const res = await preview.run();
    if (res) { toast('Preview ready — review it, then submit'); distributions.refetch(); readiness.refetch(); }
    else if (preview.error) { Alert.alert('Could not prepare the preview', preview.error.message); readiness.refetch(); }
  }

  async function onSubmit() {
    if (!current) return;
    const res = await submit.run(current.id);
    if (res) { toast('Sent to the Auditor for verification'); distributions.refetch(); detail.refetch(); }
    else if (submit.error) Alert.alert('Could not submit', submit.error.message);
  }

  async function onVerify(notes: string) {
    setVerifying(false);
    if (!current) return;
    const res = await verify.run(current.id, notes || undefined);
    if (res) { toast('Distribution verified — the Organizer finalizes it next'); distributions.refetch(); detail.refetch(); }
    else if (verify.error) Alert.alert('Could not verify', verify.error.message);
  }

  // The Auditor who verified can take it back until the Organizer finalizes.
  const canUnverify = role === 'auditor' && verified && !!member?.id && current?.verified_by === member.id;

  function onUnverify() {
    if (!current) return;
    Alert.alert('Undo your verification?', 'The preview goes back to waiting for verification, and the Organizer can’t finalize it until it’s verified again.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          const res = await unverify.run(current.id);
          if (res) { toast('Verification undone'); distributions.refetch(); detail.refetch(); }
          else if (unverify.error) Alert.alert('Could not undo', unverify.error.message);
        },
      },
    ]);
  }

  // The Auditor can send it back before verifying, or after verifying it themselves, until it's finalized.
  const canReturn = role === 'auditor' && (previewed || canUnverify);

  async function onReturn(reason: string) {
    setReturning(false);
    if (!current) return;
    const res = await returnBack.run(current.id, reason);
    if (res) { toast('Returned to the Treasurer'); distributions.refetch(); }
    else if (returnBack.error) Alert.alert('Could not return', returnBack.error.message);
  }

  // A draft (Treasurer) or a preview the Auditor hasn't verified yet can be removed.
  const canCancel = (previewed && can(role, 'cancelDistribution')) || (draft && isTreasurer);

  function onCancel() {
    if (!current) return;
    Alert.alert(
      draft ? 'Discard this draft?' : `Cancel the ${current.period} preview?`,
      draft ? 'Nothing is sent to the Auditor. You can prepare a new one any time.' : 'This deletes the preview. Nothing has been paid — you can build a new one any time.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: draft ? 'Discard' : 'Cancel preview',
        style: 'destructive',
        onPress: async () => {
          const res = await cancel.run(current.id);
          if (res) distributions.refetch();
          else if (cancel.error) Alert.alert('Could not cancel', cancel.error.message);
        },
      },
    ]);
  }

  // UC-YD-03 steps 3-5: confirm, finalize, then offer to close the cycle (UC-FC-02).
  async function onFinalize() {
    if (!current) return;
    const res = await finalize.run(current.id);
    setConfirmFinalize(false);
    if (res) {
      distributions.refetch(); detail.refetch();
      setPromptClose(true);
    } else if (finalize.error) {
      ledger.refetch();
      Alert.alert('Could not finalize', finalize.error.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Year-End Distribution" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: (canCancel && role === 'owner') || role === 'auditor' || (draft && isTreasurer) ? 190 : 130, gap: 4 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Summary ---------------- */}
        <View style={{ paddingHorizontal: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>
              {record ? (finalized ? 'Distributed' : 'To be distributed') : showEstimate ? 'Estimate — not prepared yet' : 'No distribution yet'}
            </Text>
            {record ? <StatusPill status={record.status} /> : null}
          </View>
          {summary.loading && !current ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.5, marginTop: 4 }}>
              {formatPeso(record ? record.total_amount : estimate.data?.totals.total_amount ?? cashNow)}
            </Text>
          )}
          <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
            {record
              ? `${allocations.length} member${allocations.length === 1 ? '' : 's'} · ${totalHeads} head${totalHeads === 1 ? '' : 's'} · ${finalized ? `paid ${shortDate(current.finalized_at)}` : 'nothing is paid until the Organizer finalizes'}`
              : showEstimate
                ? `${activeCycle?.name ?? 'This cycle'} · based on balances right now. Nothing is saved until the Treasurer prepares the preview.`
                : `${formatPeso(cashNow)} available cash, split by heads once the Treasurer builds a preview`}
          </Text>
        </View>

        {/* ---------------- Prepare (Treasurer) — UC-YD-01 steps 1–2, E1/E2/A3 ---------------- */}
        {isTreasurer && !verified ? (
          <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 14, gap: 10, marginTop: 18 }, shadowToken.soft]}>
            {readiness.loading && !readiness.data ? (
              <ActivityIndicator color={semantic.brand} />
            ) : blockers.length > 0 ? (
              <View style={{ backgroundColor: intent.warning.soft, borderRadius: 12, padding: 12, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <AlertTriangle size={14} color={intent.warning.text} />
                  <Text variant="label" style={{ fontSize: 12.5, color: intent.warning.text }}>{"Can't prepare yet"}</Text>
                </View>
                {blockers.map((b, i) => (
                  <Text key={`${b.kind}-${i}`} variant="caption" style={{ color: intent.warning.text, lineHeight: 16 }}>• {b.label}</Text>
                ))}
              </View>
            ) : null}
            {previewed ? (
              <Text variant="caption" color="secondary">Waiting for the Auditor. Preparing again replaces what you submitted.</Text>
            ) : null}
            <Button
              label={draft || previewed || returned ? 'Prepare again' : 'Prepare preview'}
              variant={draft ? 'ghost' : undefined}
              onPress={onPreview}
              loading={preview.loading}
              disabled={blockers.length > 0 || readiness.loading}
            />
          </View>
        ) : !current || finalized ? (
          <Text variant="caption" color="secondary" style={{ marginTop: 14, paddingHorizontal: 2 }}>The Treasurer prepares the preview. The Auditor verifies it, then the Organizer finalizes.</Text>
        ) : null}

        {record?.capital_total != null ? <Totals d={record} /> : null}

        {/* ---------------- Returned by the Auditor (UC-YD-02 A1 / UC-YD-01 A1) ---------------- */}
        {returned && current ? (
          <View style={{ backgroundColor: intent.danger.soft, borderRadius: 16, padding: 14, marginTop: 14, gap: 4 }}>
            <Text variant="label" style={{ color: intent.danger.text, fontSize: 12.5 }}>
              Returned by the Auditor{current.returned_at ? ` · ${shortDate(current.returned_at)}` : ''}
            </Text>
            <Text style={{ fontSize: 13, color: semantic.textPrimary, lineHeight: 18 }}>{current.return_reason ?? 'No notes were given.'}</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 4, lineHeight: 16 }}>
              {isTreasurer ? 'Correct any wrong entries with a reversal, then prepare again.' : 'Waiting for the Treasurer to prepare it again.'}
            </Text>
          </View>
        ) : null}


        {/* ---------------- Live estimate (nothing saved) ---------------- */}
        {showEstimate && estimate.loading && !estimate.data ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} />
        ) : null}
        {showEstimate && estimate.error && !estimate.data ? (
          <View style={{ backgroundColor: intent.danger.soft, borderRadius: 16, padding: 14, marginTop: 16, gap: 4 }}>
            <Text variant="label" style={{ color: intent.danger.text, fontSize: 12.5 }}>{"Couldn't load the estimate"}</Text>
            <Text variant="caption" color="secondary" style={{ lineHeight: 16 }}>{estimate.error.message}</Text>
          </View>
        ) : null}
        {showEstimate && estimate.data ? (
          <>
            <Totals d={estimate.data.totals} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>What each member would receive</Text>
              <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{estimate.data.members.length} members</Text>
            </View>
            {estimate.data.members.map((m, i, all) => {
              const name = m.member?.full_name ?? 'Member';
              const deduct = Number(m.loan_owed) + Number(m.penalties);
              const short = Number(m.payout) < 0;
              return (
                <View key={m.membership_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 2, borderBottomWidth: i < all.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                  <Avatar name={name} uri={m.member?.avatar_url} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{name}</Text>
                    <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>
                      {m.heads} head{m.heads === 1 ? '' : 's'} · {formatPeso(m.capital)} + {formatPeso(m.share)}{deduct > 0 ? ` − ${formatPeso(deduct)}` : ''}
                    </Text>
                    {short ? (
                      <Text variant="caption" style={{ marginTop: 1, color: intent.danger.text, fontFamily: 'Poppins_600SemiBold' }}>Owes more than their payout</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 15, color: short ? intent.danger.text : semantic.dashCard }}>{formatPeso(m.payout)}</Text>
                </View>
              );
            })}
          </>
        ) : null}

        {record && current ? (
          <>
            {/* ---------------- Approval chain ---------------- */}
            <View style={{ alignItems: 'center', marginTop: 22, marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>
                {finalized ? 'Approval trail' : 'Before you can finalize'}
              </Text>
            </View>
            <Gates steps={[
              { state: draft || returned ? 'now' : 'done', label: 'Treasurer prepares preview', sub: draft ? 'Not submitted yet' : returned ? 'Returned — prepare again' : `Submitted ${shortDate(current.submitted_at ?? current.created_at)}` },
              { state: verified || finalized ? 'done' : draft || returned ? 'wait' : 'now', label: 'Auditor verifies', sub: verified || finalized ? `Verified ${shortDate(current.verified_at)}` : undefined },
              { state: finalized ? 'done' : verified ? 'now' : 'wait', label: 'Organizer finalizes', sub: finalized ? `Finalized ${shortDateTime(current.finalized_at)}` : undefined },
            ]} />

            {/* ---------------- Auditor's notes ---------------- */}
            {(verified || finalized) && current.verify_notes ? (
              <View style={{ backgroundColor: intent.info.soft, borderRadius: 16, padding: 14, marginTop: 14, gap: 4 }}>
                <Text variant="label" style={{ color: intent.info.text, fontSize: 12.5 }}>{"Auditor's notes"}</Text>
                <Text style={{ fontSize: 13, color: semantic.textPrimary, lineHeight: 18 }}>{current.verify_notes}</Text>
              </View>
            ) : null}

            {/* ---------------- Preview vs ledger (UC-YD-02 steps 2-3, E1) ---------------- */}
            {ledger.data ? <LedgerCompare check={ledger.data} /> : null}

            {/* ---------------- Fund changed warning ---------------- */}
            {fundChanged && !ledger.data && !returned ? (
              <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: intent.danger.soft, borderRadius: 16, padding: 14, marginTop: 14 }}>
                <AlertTriangle size={18} color={intent.danger.text} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" style={{ color: intent.danger.text, fontSize: 12.5 }}>Fund has changed since this preview</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>
                    {formatPeso(cashNow)} available now vs {formatPeso(cashAtPreview)} when previewed. Rebuild the preview before finalizing.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* ---------------- Unreviewed penalties nudge ---------------- */}
            {!finalized && pendingPenaltyCount > 0 ? (
              <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: intent.warning.soft, borderRadius: 16, padding: 14, marginTop: 14 }}>
                <AlertTriangle size={18} color={intent.warning.text} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" style={{ color: intent.warning.text, fontSize: 12.5 }}>
                    {pendingPenaltyCount} penalt{pendingPenaltyCount === 1 ? 'y' : 'ies'} still need{pendingPenaltyCount === 1 ? 's' : ''} review
                  </Text>
                </View>
              </View>
            ) : null}

            {/* ---------------- Member payouts ---------------- */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>What each member receives</Text>
              <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{allocations.length} members</Text>
            </View>
            <View>
              {detail.loading ? (
                <ActivityIndicator color={semantic.brand} style={{ margin: 20 }} />
              ) : allocations.length === 0 ? (
                <Text variant="body" color="muted" style={{ paddingVertical: 8, paddingHorizontal: 2 }}>No allocations on this preview.</Text>
              ) : (
                allocations.map((a, i) => {
                  const name = a.memberships?.members?.full_name ?? 'Member';
                  const heads = a.heads ?? a.memberships?.heads ?? 0;
                  const deduct = Number(a.loan_deduction ?? 0) + Number(a.penalty_deduction ?? 0);
                  const math = a.capital != null
                    ? `${formatPeso(a.capital)} + ${formatPeso(a.share ?? 0)}${deduct > 0 ? ` − ${formatPeso(deduct)}` : ''}`
                    : null;
                  return (
                    <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 2, borderBottomWidth: i < allocations.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <Avatar name={name} uri={a.memberships?.members?.avatar_url} size={38} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{name}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>{heads} head{heads === 1 ? '' : 's'}{math ? ` · ${math}` : ''}</Text>
                        {movedMembers.has(a.membership_id) ? (
                          <Text variant="caption" style={{ marginTop: 1, color: intent.danger.text, fontFamily: 'Poppins_600SemiBold' }}>Differs from the ledger</Text>
                        ) : null}
                      </View>
                      <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 15, color: semantic.dashCard }}>{formatPeso(a.amount)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      {current && !finalized && !returned && (role === 'owner' || (role === 'auditor' && (previewed || canUnverify)) || canCancel || (draft && isTreasurer)) ? (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 10, backgroundColor: semantic.background, borderTopWidth: 1, borderColor: semantic.border, gap: 10 }}>
          {role === 'auditor' ? (
            <>
              {canUnverify
                ? <Button label="Undo verification" variant="ghost" onPress={onUnverify} loading={unverify.loading} />
                : <Button label="Verify" onPress={() => setVerifying(true)} loading={verify.loading} disabled={ledgerMismatch || ledger.loading} />}
              {canReturn ? <Button label="Return to Treasurer" variant="ghost" onPress={() => setReturning(true)} loading={returnBack.loading} /> : null}
            </>
          ) : draft && isTreasurer ? (
            <Button label="Submit for Verification" onPress={onSubmit} loading={submit.loading} disabled={fundChanged} />
          ) : role === 'owner' ? (
            <Button
              label={verified ? 'Finalize distribution' : 'Waiting on Auditor verification'}
              onPress={() => setConfirmFinalize(true)}
              disabled={!verified || fundChanged || ledgerMismatch}
              loading={finalize.loading}
            />
          ) : null}
          {canCancel ? (
            <Button label={draft ? 'Discard draft' : 'Cancel preview'} variant="ghost" onPress={onCancel} loading={cancel.loading} />
          ) : null}
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmFinalize}
        icon={Lock}
        title={`Finalize the ${current?.period ?? ''} distribution?`}
        message={`This pays out ${formatPeso(current?.total_amount ?? 0)} to ${allocations.length} member${allocations.length === 1 ? '' : 's'}, settles their deducted loans and penalties, and notifies everyone. It can't be changed after this.`}
        confirmLabel="Finalize"
        destructive
        loading={finalize.loading}
        onCancel={() => setConfirmFinalize(false)}
        onConfirm={onFinalize}
      />
      <ConfirmDialog
        visible={promptClose}
        icon={CalendarCheck}
        title="Distribution finalized"
        message="Every member was notified of their payout. Close the cycle now?"
        confirmLabel="Close the cycle"
        cancelLabel="Later"
        onCancel={() => setPromptClose(false)}
        onConfirm={() => { setPromptClose(false); router.push({ pathname: '/(app)/[groupId]/cycles/configure' as any, params: { groupId } }); }}
      />
      <ReasonPrompt
        visible={verifying}
        title={`Verify the ${current?.period ?? ''} distribution?`}
        placeholder="Notes for the Organizer (optional)"
        confirmLabel="Verify"
        onCancel={() => setVerifying(false)}
        onConfirm={onVerify}
      />
      <ReasonPrompt
        visible={returning}
        title={`Return the ${current?.period ?? ''} preview?`}
        placeholder="What needs to be fixed? (shown to the Treasurer)"
        confirmLabel="Return"
        destructive
        required
        onCancel={() => setReturning(false)}
        onConfirm={onReturn}
      />
    </SafeAreaView>
  );
}
