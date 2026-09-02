import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Receipt, FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { AppBar } from '@/components/shared/AppBar';
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

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'late' | 'warn' }) {
  const bg = tone === 'late' ? intent.danger.soft : tone === 'warn' ? intent.warning.soft : semantic.surfaceAlt;
  const fg = tone === 'late' ? intent.danger.text : tone === 'warn' ? intent.warning.text : semantic.textSecondary;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}>
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: fg }}>
        {label} <Text style={{ fontFamily: 'Poppins_700Bold', color: fg }}>{value}</Text>
      </Text>
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: 'late' | 'due' | 'review' | 'posted' }) {
  const map = { late: intent.danger, due: intent.info, review: intent.warning, posted: intent.success } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

/** Oblong, horizontally-scrollable tab pills — the mockup's `.tabs` row. */
function PillTabs<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string; count?: number; hot?: boolean }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingVertical: 9, paddingHorizontal: 15, borderRadius: 20,
              backgroundColor: active ? semantic.dashCard : semantic.surface,
              borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border,
            }}
          >
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{o.label}</Text>
            {o.count != null ? (
              <View style={{
                minWidth: 18, paddingHorizontal: 5, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? 'rgba(255,255,255,0.22)' : o.hot ? intent.danger.soft : intent.info.soft,
              }}>
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : o.hot ? intent.danger.text : intent.info.text }}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
  const headsById = useMemo(() => new Map(roster.map((m) => [m.id, m.heads])), [roster]);

  const approve = useApproveContribution(groupId!);
  const reject = useRejectContribution(groupId!);

  const rows = all.data ?? [];
  const pendingRows = rows.filter((c) => c.status === 'submitted' && !c.is_walk_in);
  const awaitingRows = rows.filter((c) => c.status === 'submitted' && c.is_walk_in && c.recorded_by === member?.id);
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

  const pct = summary && summary.expected > 0 ? Math.min(100, Math.round((summary.collected / summary.expected) * 100)) : 0;
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
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Contributions" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Collection summary ---------------- */}
        {cycle && summary ? (
          <View style={{ paddingHorizontal: 2, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Collected this {cycle.frequency === 'weekly' ? 'week' : 'period'}</Text>
              {notYetCount > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: intent.warning.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
                  <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: intent.warning.base, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>!</Text>
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>{notYetCount} not yet paid</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, letterSpacing: -1, marginTop: 4 }}>
              {formatPeso(summary.collected)} <Text style={{ fontSize: 15, color: semantic.textMuted, fontFamily: 'Poppins_700Bold' }}>of {formatPeso(summary.expected)}</Text>
            </Text>
            <Text variant="body" color="secondary" style={{ marginTop: 6, fontSize: 12.5 }}>
              {summary.collectedCount} of {summary.totalMembers} members posted{summary.dueDate ? <Text style={{ fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}> · due {shortDate(summary.dueDate.toISOString())}</Text> : null}
            </Text>
            <View style={{ height: 9, borderRadius: 5, backgroundColor: semantic.surfaceAlt, overflow: 'hidden', marginTop: 12 }}>
              <View style={{ height: '100%', width: `${pct}%`, borderRadius: 5, backgroundColor: semantic.brand }} />
            </View>
          </View>
        ) : null}

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
                return (
                  <View key={c.id} style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
                    <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 0 }}>
                      <Avatar name={nameOf(c)} size={48} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 14.5 }} numberOfLines={1}>{nameOf(c)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>
                          {METHOD_LABEL[c.payment_method ?? ''] ?? 'Payment'} · {heads} head{heads === 1 ? '' : 's'} · sent {timeAgo(c.created_at)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(c.amount)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 14, paddingBottom: 0 }}>
                      {c.external_reference ? <Fact label="Ref" value={c.external_reference} /> : null}
                      <Fact label="Sent" value={shortDate(c.created_at)} />
                      {mismatch ? <Fact label="Amount differs · expected" value={formatPeso(expectedAmt)} tone="warn" /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
                      {c.proof_signed_url ? (
                        <Pressable onPress={() => setViewProof(c)} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={16} color={semantic.brandDark} />
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => setReturnTarget(c)} disabled={reject.loading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, borderColor: semantic.borderStrong }}>
                        <Text variant="label" style={{ fontSize: 13, color: semantic.textSecondary }}>Return</Text>
                      </Pressable>
                      <Pressable onPress={() => onApprove(c.id)} disabled={approve.loading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 11, backgroundColor: semantic.brandDark }}>
                        <Text variant="label" style={{ fontSize: 13, color: '#fff' }}>Confirm</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2 }}>
                Confirming posts it straight to the ledger — a different officer than whoever recorded it must confirm.
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
                For payments that didn&apos;t come through the app — cash handed to you, or a transfer the member never uploaded. A different officer still confirms it before it posts.
              </Text>
            </View>

            {!cycle ? (
              <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>No active cycle to record against.</Text>
            ) : (
              <>
                {needsRecording.length > 0 ? (
                  <View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Who hasn&apos;t paid this period</Text>
                    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
                      {needsRecording.map(({ m, entry }) => (
                        <Pressable key={m.id} onPress={() => goToRecordScreen(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: 1, borderColor: semantic.border }}>
                          <Avatar name={m.members?.full_name ?? 'Member'} size={38} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{m.members?.full_name ?? 'Member'}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              <Text variant="caption" color="secondary">{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                              <Tag label={entry!.kind === 'late' ? 'Late' : 'Due'} tone={entry!.kind === 'late' ? 'late' : 'due'} />
                            </View>
                          </View>
                          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(entry!.amount)}</Text>
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
                          <Avatar name={m.members?.full_name ?? 'Member'} size={38} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{m.members?.full_name ?? 'Member'}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              <Text variant="caption" color="secondary">{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                              <Tag label={entry!.kind === 'review' ? 'Awaiting review' : 'Posted'} tone={entry!.kind === 'review' ? 'review' : 'posted'} />
                            </View>
                          </View>
                          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>{formatPeso(entry!.amount)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {needsRecording.length === 0 && alreadyHandled.length === 0 ? (
                  <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>No members to show for this period yet.</Text>
                ) : null}
              </>
            )}
          </View>
        )}

        {/* ================= AWAITING AUDITOR ================= */}
        {tab === 'awaiting' && (
          <View style={{ marginTop: 16 }}>
            {all.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            awaitingRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing waiting</Text>
                <Text variant="body" color="secondary">Walk-ins you record show up here until another officer confirms them.</Text>
              </View>
            ) : (
              <View style={[{ backgroundColor: intent.info.soft, borderRadius: 16, overflow: 'hidden' }]}>
                {awaitingRows.map((c, i) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < awaitingRows.length - 1 ? 1 : 0, borderColor: 'rgba(44,110,155,0.13)' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(44,110,155,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: intent.info.text }}>₱</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" style={{ fontSize: 13, color: intent.info.text }} numberOfLines={1}>{nameOf(c)}</Text>
                      <Text variant="caption" style={{ marginTop: 2, color: intent.info.text, opacity: 0.75 }}>Recorded by you {timeAgo(c.created_at)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.info.text }}>{formatPeso(c.amount)}</Text>
                  </View>
                ))}
                <Text variant="caption" style={{ padding: 13, paddingTop: 10, color: intent.info.text, opacity: 0.8, lineHeight: 16 }}>
                  A different officer confirms these before they reach the ledger. Members still see their own as under review.
                </Text>
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
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.danger.text, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>Returned {shortDate(c.updated_at)}</Text>
                        <Text style={{ fontSize: 12, lineHeight: 17, color: '#8E3227', fontFamily: 'Poppins_500Medium' }}>{c.rejection_reason}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, padding: 13 }}>
                      <Avatar name={nameOf(c)} size={40} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{nameOf(c)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                          {c.is_walk_in ? 'Fix it and record it again from Record new' : 'Waiting on the member to resubmit'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>{formatPeso(c.amount)}</Text>
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
