/**
 * app/(app)/[groupId]/loans/record-repayment.tsx — Treasurer's loan
 * repayments workspace. Redesigned per the "treasurer-repayments" reference,
 * mirroring contributions/confirm.tsx's real structure:
 *
 *   Pending          — member self-submitted repayment claims awaiting this
 *                       officer's confirm/reject (loan_payments.is_walk_in = false)
 *   Record new        — active loans list, opens loans/record.tsx to submit
 *                       a walk-in repayment claim (no longer posts instantly
 *                       — see migration 0045)
 *   Awaiting Auditor   — walk-ins THIS officer recorded, still waiting on a
 *                       different officer (specifically the Auditor when the
 *                       recorder is the Treasurer) to confirm
 *   Returned           — repayments THIS officer recorded that got rejected
 *
 * The allocation preview on Pending cards (interest first, then principal)
 * uses the same formula confirm_loan_repayment computes server-side —
 * shown here so the Treasurer can check it against the proof, not trusted
 * as the actual posting (the server recomputes it independently).
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Receipt, FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { PillTabs } from '@/components/ui/PillTabs';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import type { Loan, LoanPayment } from '@/api/lending';
import { useLoans, useRepayments, useConfirmRepayment, useRejectRepayment } from '@/features/lending/lending.hooks';

type Tab = 'pending' | 'record' | 'awaiting' | 'returned';

function loanName(l: Loan): string {
  return l.membership?.members?.full_name ?? 'Member';
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

function Tag({ label, tone }: { label: string; tone: 'review' | 'posted' | 'settle' }) {
  const map = { review: intent.warning, posted: intent.success, settle: intent.info } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

export default function RecordRepayment() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');

  const loans = useLoans(groupId!, {});
  const repayments = useRepayments(groupId!);
  const confirmAction = useConfirmRepayment(groupId!);
  const rejectAction = useRejectRepayment(groupId!);

  const allLoans = loans.data ?? [];
  const activeLoans = allLoans.filter((l) => l.status === 'active' || l.status === 'approved');
  const settledLoans = allLoans.filter((l) => l.status === 'paid');
  const loansById = useMemo(() => new Map(allLoans.map((l) => [l.id, l])), [allLoans]);

  const rows = repayments.data ?? [];
  const pendingRows = rows.filter((p) => p.status === 'submitted' && !p.is_walk_in);
  const awaitingRows = rows.filter((p) => p.status === 'submitted' && p.is_walk_in && p.recorded_by === member?.id);
  const returnedRows = rows.filter((p) => p.status === 'rejected' && p.recorded_by === member?.id);

  // Per-loan status tag for the "Record new" list — is there already a claim
  // in flight for this loan, and whose court is it in?
  const pendingByLoan = useMemo(() => new Map(pendingRows.map((p) => [p.loans?.id, p])), [pendingRows]);
  const awaitingByLoan = useMemo(() => new Map(awaitingRows.map((p) => [p.loans?.id, p])), [awaitingRows]);

  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.outstanding_balance), 0);
  const totalInterestEarned = rows.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.interest_portion || 0), 0);
  const postedCount = rows.filter((p) => p.status === 'paid').length;

  function goToRecordScreen(l: Loan) {
    router.push({ pathname: '/(app)/[groupId]/loans/record' as any, params: { groupId, loanId: l.id } });
  }

  async function onConfirm(p: LoanPayment) {
    const ok = await confirmAction.run(p.id);
    if (ok !== undefined) repayments.refetch();
    else if (confirmAction.error) Alert.alert('Could not confirm', confirmAction.error.message);
  }

  const [rejectTarget, setRejectTarget] = useState<LoanPayment | null>(null);
  async function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    const ok = await rejectAction.run(id, reason || undefined);
    if (ok !== undefined) repayments.refetch();
    else if (rejectAction.error) Alert.alert('Could not return', rejectAction.error.message);
  }

  const [viewProof, setViewProof] = useState<LoanPayment | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Loan repayments" subtitle="Treasurer" />
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
          <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>Principal left</Text>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }}>{formatPeso(totalOutstanding)}</Text>
            </View>
            <View style={{ flex: 1, paddingLeft: 13, borderLeftWidth: 1, borderColor: semantic.border }}>
              <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>Interest earned</Text>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: intent.success.text, marginTop: 3 }}>{formatPeso(totalInterestEarned)}</Text>
            </View>
          </View>
        </View>

        <PillTabs<Tab>
          options={[
            { key: 'pending', label: 'Pending', count: pendingRows.length },
            { key: 'record', label: 'Record new' },
            { key: 'awaiting', label: 'Awaiting Auditor', count: awaitingRows.length },
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
                const interest = Math.min(Math.round(outstanding * rate * 100) / 100, amt);
                const principal = Math.min(amt - interest, outstanding);
                const balanceAfter = Math.max(outstanding - principal, 0);
                const settles = balanceAfter <= 0.01;
                return (
                  <View key={p.id} style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card, settles ? { borderLeftWidth: 4, borderLeftColor: intent.success.base } : undefined]}>
                    {settles ? (
                      <View style={{ backgroundColor: intent.success.soft, padding: 12, paddingBottom: 10 }}>
                        <Text variant="label" style={{ fontSize: 12, color: intent.success.text }}>This settles the loan</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 15 }}>After this payment {repaymentName(p)} owes nothing — the loan closes and they become eligible to borrow again.</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 0 }}>
                      <Avatar name={repaymentName(p)} size={44} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 14.5 }} numberOfLines={1}>{repaymentName(p)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>Submitted {timeAgo(p.created_at)}</Text>
                      </View>
                      <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(p.amount)}</Text>
                    </View>

                    {loan ? (
                      <View style={{ margin: 14, marginBottom: 0, backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12 }}>
                        <Text variant="overline" color="muted" style={{ marginBottom: 6 }}>How this will be applied</Text>
                        <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                          <Text variant="caption" color="secondary">Interest first</Text>
                          <Text style={{ marginLeft: 'auto', fontFamily: 'Poppins_700Bold', fontSize: 12.5, color: intent.warning.text }}>{formatPeso(interest)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                          <Text variant="caption" color="secondary">Then principal</Text>
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
              <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2 }}>
                Confirming posts it straight to the ledger — a different officer than whoever submitted it must confirm.
              </Text>
            </View>
          )
        )}

        {/* ================= RECORD NEW ================= */}
        {tab === 'record' && (
          <View style={{ marginTop: 16, gap: 16 }}>
            <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: intent.info.soft, borderRadius: 16, padding: 13 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: intent.info.base, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#fff' }}>i</Text>
              </View>
              <Text variant="caption" style={{ flex: 1, color: intent.info.text, lineHeight: 16 }}>
                For repayments that didn&apos;t come through the app — cash handed to you, or a transfer the member never uploaded. The Auditor still confirms it before it posts.
              </Text>
            </View>

            {loans.loading ? <ActivityIndicator color={semantic.brand} /> : activeLoans.length === 0 ? (
              <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>No active loans right now.</Text>
            ) : (
              <View>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Active loans</Text>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
                  {activeLoans.map((l) => {
                    const outstanding = Number(l.outstanding_balance ?? 0);
                    const principal = Number(l.principal ?? 0);
                    const pct = principal ? Math.max(0, Math.min(100, Math.round((1 - outstanding / principal) * 100))) : 0;
                    const awaitingP = awaitingByLoan.get(l.id);
                    const pendingP = pendingByLoan.get(l.id);
                    return (
                      <Pressable key={l.id} onPress={() => goToRecordScreen(l)} style={{ flexDirection: 'row', gap: 12, padding: 13, borderBottomWidth: 1, borderColor: semantic.border }}>
                        <Avatar name={loanName(l)} size={38} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{loanName(l)}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <Text variant="caption" color="secondary">{formatPeso(outstanding)} left</Text>
                            {pendingP ? <Tag label="Awaiting your review" tone="review" /> : awaitingP ? <Tag label="Awaiting Auditor" tone="settle" /> : null}
                          </View>
                          <View style={{ height: 5, borderRadius: 3, backgroundColor: semantic.surfaceAlt, overflow: 'hidden', marginTop: 8 }}>
                            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: intent.success.base, borderRadius: 3 }} />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {settledLoans.length > 0 ? (
              <View>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Settled</Text>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
                  {settledLoans.map((l, i) => (
                    <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < settledLoans.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <Avatar name={loanName(l)} size={38} />
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

        {/* ================= AWAITING AUDITOR ================= */}
        {tab === 'awaiting' && (
          <View style={{ marginTop: 16 }}>
            {repayments.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            awaitingRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing waiting</Text>
                <Text variant="body" color="secondary">Walk-ins you record show up here until the Auditor confirms them.</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: intent.info.soft, borderRadius: 16, overflow: 'hidden' }}>
                {awaitingRows.map((p, i) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < awaitingRows.length - 1 ? 1 : 0, borderColor: 'rgba(44,110,155,0.13)' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(44,110,155,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: intent.info.text }}>₱</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" style={{ fontSize: 13, color: intent.info.text }} numberOfLines={1}>{repaymentName(p)}</Text>
                      <Text variant="caption" style={{ marginTop: 2, color: intent.info.text, opacity: 0.75 }}>Recorded by you {timeAgo(p.created_at)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.info.text }}>{formatPeso(p.amount)}</Text>
                  </View>
                ))}
                <Text variant="caption" style={{ padding: 13, paddingTop: 10, color: intent.info.text, opacity: 0.8, lineHeight: 16 }}>
                  The Auditor confirms these before the loan balance changes. Members still see the amount outstanding as before.
                </Text>
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
                  <View key={p.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden', borderLeftWidth: 4, borderLeftColor: intent.danger.base }, shadowToken.card]}>
                    {p.rejection_reason ? (
                      <View style={{ backgroundColor: intent.danger.soft, padding: 12, paddingBottom: 10 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.danger.text, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>Returned {shortDate(p.updated_at)}</Text>
                        <Text style={{ fontSize: 12, lineHeight: 17, color: '#8E3227', fontFamily: 'Poppins_500Medium' }}>{p.rejection_reason}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, padding: 13 }}>
                      <Avatar name={repaymentName(p)} size={40} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{repaymentName(p)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                          {p.is_walk_in ? 'Fix it and record it again from Record new' : 'Waiting on the member to resubmit'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>{formatPeso(p.amount)}</Text>
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
        onCancel={() => setRejectTarget(null)}
        onConfirm={onRejectConfirm}
      />
    </SafeAreaView>
  );
}
