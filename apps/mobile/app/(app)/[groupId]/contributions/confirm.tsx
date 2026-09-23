import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Image, Modal } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Receipt, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { PillFilters } from '@/components/shared/PillFilters';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useQuery } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { listMembers, type GroupMember } from '@/api/groups';
import { type Contribution } from '@/api/contributions';
import { useContributions, useApproveContribution, useRejectContribution } from '@/features/contributions/contributions.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { buildTimeline, currentPeriodIndex, periodLabel, type PeriodEntry } from '@/features/contributions/periods';

type Tab = 'pending' | 'record' | 'awaiting' | 'returned';

const METHOD_LABEL: Record<string, string> = { paymongo: 'PayMongo', gcash: 'GCash', cash: 'Cash', bank_transfer: 'Bank transfer', other: 'Other' };

function nameOf(c: Contribution): string {
  return c.memberships?.members?.full_name ?? 'Member';
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

function Fact({ label, value, tone }: { label?: string; value: string; tone?: 'late' | 'warn' }) {
  const bg = tone === 'late' ? intent.danger.soft : tone === 'warn' ? intent.warning.soft : semantic.surfaceAlt;
  const fg = tone === 'late' ? intent.danger.text : tone === 'warn' ? intent.warning.text : semantic.textSecondary;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 1.5 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: fg }}>
        {label ? `${label} ` : ''}{value}
      </Text>
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: 'late' | 'due' | 'review' | 'posted' }) {
  const map = { late: intent.danger, due: intent.info, review: intent.warning, posted: intent.success } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: t.text }}>{label}</Text>
    </View>
  );
}


export default function ConfirmContributions() {
  const { groupId, tab: initialTab } = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab === 'record' ? 'record' : 'pending');

  const { cycle } = useActiveCycle(groupId!);
  const all = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const membersQ = useQuery(() => listMembers(groupId!), [groupId]);
  const roster: GroupMember[] = membersQ.data ?? [];
  // "Never loaded yet", so a background refetch doesn't flash the spinner again.
  const firstLoad = (membersQ.data == null && !membersQ.error) || (all.data == null && !all.error);
  const periodWord = cycle?.frequency === 'weekly' ? 'week' : cycle?.frequency === 'quarterly' ? 'quarter' : 'month';
  const headsById = useMemo(() => new Map(roster.map((m) => [m.id, m.heads])), [roster]);

  const approve = useApproveContribution(groupId!);
  const reject = useRejectContribution(groupId!);

  const rows = all.data ?? [];
  // How many live (non-rejected) rows in this cycle share a reference number —
  // reused already-loaded data instead of a per-row API call, same idea as
  // the member-side checkDuplicateReference but computed once here.
  const refCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.status === 'rejected' || !r.external_reference) continue;
      counts.set(r.external_reference, (counts.get(r.external_reference) ?? 0) + 1);
    }
    return counts;
  }, [rows]);
  // My own contribution never shows here for me to act on — I can't approve
  // what I recorded myself (own submission or a walk-in), so it moves to
  // "Awaiting confirmation" instead, purely to track its status.
  const pendingRows = rows.filter((c) => c.status === 'submitted' && !c.is_walk_in && c.recorded_by !== member?.id);
  const awaitingRows = rows.filter((c) => c.status === 'submitted' && c.recorded_by === member?.id);
  const returnedRows = rows.filter((c) => c.status === 'rejected' && c.recorded_by === member?.id);

  // ---- Collection summary for the active cycle's current period ----
  const summary = useMemo(() => {
    if (!cycle || roster.length === 0) return null;
    const idx = currentPeriodIndex(cycle);
    const totalHeads = roster.reduce((s, m) => s + m.heads, 0);
    const expected = totalHeads * Number(cycle.contribution_amount);
    let collected = 0, collectedCount = 0, dueDate: Date | null = null, label = '';
    const perMember = new Map<string, PeriodEntry | null>();
    for (const m of roster) {
      const memberRows = rows.filter((c) => c.membership_id === m.id);
      const timeline = buildTimeline(cycle, memberRows, m.heads);
      const entry = idx !== null ? (timeline[idx] ?? null) : (timeline[timeline.length - 1] ?? null);
      perMember.set(m.id, entry);
      if (!entry) continue;
      if (!dueDate) { dueDate = entry.dueDate; label = periodLabel(entry.periodStart, cycle.frequency, true); }
      if (entry.kind === 'paid') { collected += entry.amount; collectedCount++; }
    }
    return { expected, collected, collectedCount, dueDate, label, totalMembers: roster.length, perMember };
  }, [cycle, roster, rows]);

  const notYetCount = summary ? summary.totalMembers - summary.collectedCount : 0;

  // ---- Record new: who still needs recording vs. already handled this period ----
  const needsRecording = useMemo(() => {
    if (!summary) return [];
    return roster
      .map((m) => ({ m, entry: summary.perMember.get(m.id) ?? null }))
      .filter(({ entry }) => entry && (entry.kind === 'due' || entry.kind === 'late'));
  }, [roster, summary]);
  const alreadyHandled = useMemo(() => {
    if (!summary) return [];
    return roster
      .map((m) => ({ m, entry: summary.perMember.get(m.id) ?? null }))
      .filter(({ entry }) => entry && (entry.kind === 'review' || entry.kind === 'paid'));
  }, [roster, summary]);

  function goToRecordScreen(m: GroupMember) {
    router.push({ pathname: '/(app)/[groupId]/contributions/record' as any, params: { groupId, membershipId: m.id } });
  }

  async function onApprove(id: string) {
    const ok = await approve.run(id);
    if (ok !== undefined) all.refetch();
    else if (approve.error) Alert.alert('Could not confirm', approve.error.message);
  }

  const [returnTarget, setReturnTarget] = useState<Contribution | null>(null);
  async function onReturnConfirm(reason: string) {
    if (!returnTarget) return;
    const id = returnTarget.id;
    setReturnTarget(null);
    const ok = await reject.run(id, reason || undefined);
    if (ok !== undefined) all.refetch();
    else if (reject.error) Alert.alert('Could not return', reject.error.message);
  }

  const [viewProof, setViewProof] = useState<Contribution | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Contributions" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Collection summary ---------------- */}
        {firstLoad ? (
          <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'center', minHeight: 110 }}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : cycle && summary ? (
          <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>This {periodWord}</Text>
              {notYetCount > 0 ? (
                <View style={{ backgroundColor: intent.warning.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
                  <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: intent.warning.text }}>{notYetCount} not yet paid</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              {[
                { k: 'Collected', v: summary.collected, color: intent.success.base },
                { k: 'Expected', v: summary.expected, color: semantic.brand },
                { k: 'Still to collect', v: Math.max(0, summary.expected - summary.collected), color: intent.warning.base },
              ].map((x, i) => (
                <View key={x.k} style={{ flex: 1, paddingLeft: i > 0 ? 12 : 0, borderLeftWidth: i > 0 ? 1 : 0, borderColor: 'rgba(42,62,75,0.1)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 3, backgroundColor: x.color }} />
                    <Text variant="overline" color="muted" numberOfLines={1}>{x.k}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }} numberOfLines={1} adjustsFontSizeToFit>{formatPeso(x.v)}</Text>
                </View>
              ))}
            </View>
            <Text variant="body" color="secondary" style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: 'rgba(42,62,75,0.1)', fontSize: 12.5 }}>
              {summary.collectedCount} of {summary.totalMembers} members posted{summary.dueDate ? <Text> · due {shortDate(summary.dueDate.toISOString())}</Text> : null}
            </Text>
          </View>
        ) : null}

        <PillFilters<Tab>
          options={[
            { key: 'pending', label: 'Pending', count: pendingRows.length },
            { key: 'record', label: 'Record new' },
            { key: 'awaiting', label: 'Awaiting confirmation', count: awaitingRows.length },
            { key: 'returned', label: 'Returned', count: returnedRows.length, hot: returnedRows.length > 0 },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* ================= PENDING ================= */}
        {tab === 'pending' && (
          all.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
          pendingRows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text variant="h3" style={{ fontSize: 16 }}>All confirmed</Text>
              <Text variant="body" color="secondary">No proofs waiting on you.</Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 16 }}>
              {pendingRows.map((c) => {
                const heads = headsById.get(c.membership_id) ?? 1;
                const expectedAmt = cycle ? Number(cycle.contribution_amount) * heads : null;
                const mismatch = expectedAmt != null && Math.abs(Number(c.amount) - expectedAmt) > 0.01;
                // Same reference used by another live (non-rejected) row in this cycle —
                // computed from already-loaded rows, not a fresh check per card.
                const isDuplicateRef = !!c.external_reference && (refCounts.get(c.external_reference) ?? 0) > 1;
                const noProof = !c.proof_signed_url;
                return (
                  <View key={c.id} style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
                    <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 0 }}>
                      <Avatar name={nameOf(c)} uri={c.memberships?.members?.avatar_url} size={48} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={2}>{nameOf(c)}</Text>
                        <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, marginTop: 2 }}>{formatPeso(c.amount)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>
                          {METHOD_LABEL[c.payment_method ?? ''] ?? 'Payment'} · {heads} head{heads === 1 ? '' : 's'} · sent {timeAgo(c.created_at)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 14, paddingBottom: 0 }}>
                      {c.external_reference ? <Fact label="Ref" value={c.external_reference} /> : <Fact value="No reference number" tone="warn" />}
                      <Fact label="Sent" value={shortDate(c.created_at)} />
                      {mismatch ? <Fact label="Amount differs · expected" value={formatPeso(expectedAmt)} tone="warn" /> : null}
                      {isDuplicateRef ? <Fact value="Duplicate reference" tone="late" /> : null}
                      {noProof ? <Fact value="No proof attached" tone="late" /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 }}>
                      {c.proof_signed_url ? (
                        <Pressable onPress={() => setViewProof(c)} style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', backgroundColor: semantic.surfaceAlt }}>
                          <Image source={{ uri: c.proof_signed_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </Pressable>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      <Pressable
                        onPress={() => setReturnTarget(c)}
                        disabled={reject.loading}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: intent.danger.soft, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12 }}
                      >
                        <X size={12} color={intent.danger.text} strokeWidth={2.6} />
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>Return</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onApprove(c.id)}
                        disabled={approve.loading}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: intent.success.soft, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12 }}
                      >
                        <Check size={12} color={intent.success.text} strokeWidth={2.6} />
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: intent.success.text }}>Confirm</Text>
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
            {firstLoad ? (
              <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} />
            ) : !cycle ? (
              <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>No active cycle to record against.</Text>
            ) : (
              <>
                {needsRecording.length > 0 ? (
                  <View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Who hasn&apos;t paid this {periodWord}</Text>
                    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
                      {needsRecording.map(({ m, entry }) => (
                        <Pressable key={m.id} onPress={() => goToRecordScreen(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: 1, borderColor: semantic.border }}>
                          <Avatar name={m.members?.full_name ?? 'Member'} uri={m.members?.avatar_url} size={38} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{m.members?.full_name ?? 'Member'}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              <Text variant="caption" color="secondary">{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                              <Tag label={entry!.kind === 'late' ? 'Late' : 'Due'} tone={entry!.kind === 'late' ? 'late' : 'due'} />
                            </View>
                          </View>
                          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(entry!.amount)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {alreadyHandled.length > 0 ? (
                  <View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Already handled</Text>
                    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
                      {alreadyHandled.map(({ m, entry }) => (
                        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: 1, borderColor: semantic.border }}>
                          <Avatar name={m.members?.full_name ?? 'Member'} uri={m.members?.avatar_url} size={38} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{m.members?.full_name ?? 'Member'}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              <Text variant="caption" color="secondary">{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                              <Tag label={entry!.kind === 'review' ? 'Awaiting review' : 'Posted'} tone={entry!.kind === 'review' ? 'review' : 'posted'} />
                            </View>
                          </View>
                          <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textMuted }}>{formatPeso(entry!.amount)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {needsRecording.length === 0 && alreadyHandled.length === 0 ? (
                  <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>No members to show for this {periodWord} yet.</Text>
                ) : null}
              </>
            )}
          </View>
        )}

        {/* ================= AWAITING CONFIRMATION ================= */}
        {tab === 'awaiting' && (
          <View style={{ marginTop: 16 }}>
            {all.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            awaitingRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing waiting</Text>
                <Text variant="body" color="secondary">Your own contribution and any walk-ins you record show up here until another officer confirms them.</Text>
              </View>
            ) : (
              <View style={[{ backgroundColor: intent.info.soft, borderRadius: 16, overflow: 'hidden' }]}>
                {awaitingRows.map((c, i) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < awaitingRows.length - 1 ? 1 : 0, borderColor: 'rgba(44,110,155,0.13)' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(44,110,155,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: intent.info.text }}>₱</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: intent.info.text }} numberOfLines={1}>{nameOf(c)}</Text>
                      <Text variant="caption" style={{ marginTop: 2, color: intent.info.text, opacity: 0.75 }}>Recorded by you {timeAgo(c.created_at)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.info.text }}>{formatPeso(c.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ================= RETURNED ================= */}
        {tab === 'returned' && (
          <View style={{ marginTop: 16 }}>
            {all.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            returnedRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing returned</Text>
                <Text variant="body" color="secondary">Anything you recorded that gets sent back shows up here.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {returnedRows.map((c) => (
                  <View key={c.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden', borderLeftWidth: 4, borderLeftColor: intent.danger.base }, shadowToken.card]}>
                    {c.rejection_reason ? (
                      <View style={{ backgroundColor: intent.danger.soft, padding: 12, paddingBottom: 10 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>Returned {shortDate(c.updated_at)}</Text>
                        <Text style={{ fontSize: 12, lineHeight: 17, color: '#8E3227', fontFamily: 'Poppins_500Medium' }}>{c.rejection_reason}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, padding: 13 }}>
                      <Avatar name={nameOf(c)} uri={c.memberships?.members?.avatar_url} size={40} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{nameOf(c)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                          {c.is_walk_in ? 'Fix it and record it again from Record new' : 'Waiting on the member to resubmit'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textMuted }}>{formatPeso(c.amount)}</Text>
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
                <Text variant="label">{viewProof ? nameOf(viewProof) : ''}</Text>
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
        visible={!!returnTarget}
        title={returnTarget ? `Return ${nameOf(returnTarget)}'s proof?` : 'Return proof'}
        placeholder="What needs to be fixed? (visible to the member)"
        confirmLabel="Return"
        destructive
        onCancel={() => setReturnTarget(null)}
        onConfirm={onReturnConfirm}
      />
    </SafeAreaView>
  );
}
