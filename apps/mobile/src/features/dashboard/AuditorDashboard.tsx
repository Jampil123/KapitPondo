import { useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CheckCircle2, Check, Flag, Banknote, Clock, Download,
  AlertTriangle, ChevronRight,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
import { DashboardBand, glassPanel, onBandText } from '@/components/shared/DashboardBand';
import { Alert } from '@/lib/alert';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useRepayments } from '@/features/lending/lending.hooks';
import { useLoanAudits } from '@/features/loanAudits/loanAudits.hooks';
import { useReversalRequests } from '@/features/ledger/ledger.hooks';
import { useDistributions, useVerifyDistribution, useCancelDistribution } from '@/features/distribution/distribution.hooks';
import { useAuditLog, useAuditTrailSince, useFlagPosting } from '@/features/auditlog/auditlog.hooks';
import { useFindings } from '@/features/findings/findings.hooks';
import { useFlags } from '@/features/flags/flags.hooks';
import { FlagPrompt } from '@/features/flags/FlagPrompt';
import { AuditTimeline } from '@/features/auditlog/AuditTimeline';
import type { FlaggableEntityType } from '@/api/auditLog';

const HERO_ROWS = 3;

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function SectionHead({ title, aside, tone, onAsidePress }: { title: string; aside?: string; tone?: 'hot' | 'calm'; onAsidePress?: () => void }) {
  const color = onAsidePress ? semantic.brandDark : tone === 'hot' ? intent.danger.text : tone === 'calm' ? intent.success.text : semantic.textSecondary;
  const label = aside ? <Text variant="caption" style={{ fontFamily: 'Poppins_600SemiBold', color }}>{aside}</Text> : null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {label && onAsidePress ? <Pressable onPress={onAsidePress} hitSlop={8}>{label}</Pressable> : label}
    </View>
  );
}

/** Everything the Auditor's screens derive from — fetched once per tree (hero and body are separate trees). */
function useAuditorData(groupId: string) {
  const { member } = useAuth();
  const { membership } = useActiveGroup();
  const contribs = useContributions(groupId, {});
  const repayments = useRepayments(groupId);
  const reversals = useReversalRequests(groupId);

  const pending = useMemo(() => ({
    contribs: (contribs.data ?? []).filter((c) => c.status === 'submitted'),
    repayments: (repayments.data ?? []).filter((p) => p.status === 'submitted'),
    reversals: (reversals.data ?? []).filter((r) => r.status === 'pending_verification'),
  }), [contribs.data, repayments.data, reversals.data]);

  // Items that are the Auditor's own can't be verified by them (API enforces it too).
  const isMine = useMemo(() => ({
    contrib: (c: { membership_id: string }) => c.membership_id === membership?.id,
    repayment: (p: { loans?: { membership_id: string } }) => p.loans?.membership_id === membership?.id,
    reversal: (r: { entry?: { membership_id: string | null } }) => !!r.entry?.membership_id && r.entry.membership_id === membership?.id,
  }), [membership?.id]);

  return {
    member, membership, contribs, repayments, reversals, pending, isMine,
    loading: contribs.loading || repayments.loading || reversals.loading,
  };
}

/* ---------------- Main card ---------------- */
type WaitingRow = { key: string; name: string; kind: string; problem: string | null; amount: number | string | null; date: string };

function VerificationHero({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { pending, isMine, loading } = useAuditorData(groupId);

  // Oldest first, same order as To review. `problem` is the first field that doesn't check out.
  const rows: WaitingRow[] = useMemo(() => [
    ...pending.contribs.filter((c) => !isMine.contrib(c)).map((c): WaitingRow => ({
      key: `c-${c.id}`, name: c.memberships?.members?.full_name ?? 'Member', kind: 'Contribution',
      problem: !c.proof_url ? 'no proof attached' : null, amount: c.amount, date: c.created_at,
    })),
    ...pending.repayments.filter((p) => !isMine.repayment(p)).map((p): WaitingRow => ({
      key: `p-${p.id}`, name: p.loans?.membership?.members?.full_name ?? 'Member', kind: 'Loan repayment',
      problem: !p.proof_url ? 'no proof attached' : null, amount: p.amount, date: p.created_at,
    })),
    ...pending.reversals.filter((r) => !isMine.reversal(r)).map((r): WaitingRow => ({
      key: `r-${r.id}`, name: r.entry?.description ?? r.entry?.entry_type.replace(/_/g, ' ') ?? 'Ledger entry', kind: 'Reversal',
      problem: !r.entry ? 'no original linked' : null, amount: r.entry ? r.entry.amount : null, date: r.initiated_at,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [pending, isMine]);

  return (
    <View style={{ paddingTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        {loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginVertical: 4 }} />
        ) : rows.length === 0 ? (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={24} color={intent.success.text} />
              <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.6 }}>All clear</Text>
            </View>
            <Text style={{ fontSize: 12.5, lineHeight: 18, fontFamily: 'Poppins_500Medium', color: onBandText, marginTop: 6 }}>
              No records are waiting for verification. New ones appear here when the Treasurer records them.
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 34, lineHeight: 40, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1 }}>{rows.length}</Text>
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: onBandText }}>
              record{rows.length === 1 ? '' : 's'} waiting for your verification
            </Text>
          </View>
        )}
      </View>

      {!loading && rows.length > 0 ? (
        <>
          <View style={[glassPanel, { marginTop: 12, paddingHorizontal: 14, paddingVertical: 4 }]}>
            {rows.slice(0, HERO_ROWS).map((r, i, shown) => (
              <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < shown.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{r.name}</Text>
                  <Text style={{ fontSize: 11.5, color: r.problem ? intent.danger.text : semantic.textSecondary }} numberOfLines={1}>
                    {r.kind}, {r.problem ?? 'all fields match'}
                  </Text>
                </View>
                {r.amount !== null ? <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(r.amount)}</Text> : null}
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/[groupId]/ledger' as any, params: { groupId, tab: 'queue' } })}
            style={{ marginTop: 10, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.brandDark }}
          >
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Open verification queue</Text>
          </Pressable>
        </>
      ) : null}
      </View>
  );
}

/** Flag with a note for the Organizer — used by the failed-check cards. */
function useFlagPrompt(groupId: string) {
  const flag = useFlagPosting(groupId);
  const [target, setTarget] = useState<{ type: FlaggableEntityType; id: string; label: string; reason?: string } | null>(null);

  async function confirm(reason: string, note: string) {
    if (!target) return;
    const t = target;
    setTarget(null);
    const ok = await flag.run({ entity_type: t.type, entity_id: t.id, reason, note: note || undefined, label: t.label });
    if (ok === undefined) Alert.alert('Could not flag', flag.error?.message ?? 'Try again.');
    else Alert.alert('Flagged', 'The Organizer has been notified.');
  }

  const prompt = (
    <FlagPrompt
      visible={!!target}
      title={target ? `Flag ${target.label}` : 'Flag'}
      defaultReason={target?.reason}
      onCancel={() => setTarget(null)}
      onConfirm={confirm}
    />
  );
  return { open: setTarget, busy: flag.loading, prompt };
}

/* ---------------- Stat tiles + failed checks (replaces To review) ---------------- */
const TRAIL_DAYS = 90;
// Audit actions that count as "verified by you" — see the logAudit calls in contributions/lending/ledger/distribution routes.
const VERIFY_ACTIONS = new Set(['approved:contribution', 'confirmed:loan_payment', 'verified:reversal_request', 'verified:distribution']);

function StatTile({ value, label, onPress }: { value: number | null; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[{ flex: 1, backgroundColor: semantic.card, borderRadius: 18, padding: 14, minHeight: 104, justifyContent: 'center' }, shadowToken.soft]}>
      {value === null ? <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start' }} /> : (
        <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{value}</Text>
      )}
      <Text style={{ fontSize: 11.5, lineHeight: 15, color: semantic.textSecondary, marginTop: 2 }}>{label}</Text>
    </Pressable>
  );
}

/** `open` is a page that explains the failure (a loan's audit); without one, tapping goes straight to the flag prompt. */
type FailedCheck = { key: string; title: string; sub: string; flag: { type: FlaggableEntityType; id: string; label: string }; open?: { route: string; params: Record<string, string> } };

/** Postings that broke a control after they went through — the kind of thing the Auditor exists to catch. */
function useFailedChecks(groupId: string, data: ReturnType<typeof useAuditorData>, flaggedIds: Set<string>) {
  const loanAudits = useLoanAudits(groupId);
  const { contribs, repayments } = data;

  const checks = useMemo(() => {
    const out: FailedCheck[] = [];
    const same = (a?: string | null, b?: string | null) => !!a && !!b && a === b;

    // Loans: the server re-runs the lending rules as of each approval (loan-audits) — same source as the Loan audits page.
    (loanAudits.data ?? []).filter((l) => l.failed > 0).forEach((l) => {
      const borrower = l.borrower ?? 'Member';
      const first = l.checks.find((c) => !c.passed)!;
      out.push({
        key: `l-${l.loan_id}`, title: `${borrower} · Loan ${l.ref}`, sub: l.failed > 1 ? `${first.detail} +${l.failed - 1} more` : first.detail,
        flag: { type: 'loan', id: l.loan_id, label: `${l.ref} · ${borrower}` },
        open: { route: 'audit/loan/[id]', params: { id: l.loan_id } },
      });
    });

    (contribs.data ?? []).filter((c) => c.status === 'approved' && !c.auto_confirmed).forEach((c) => {
      const payer = c.memberships?.members?.full_name ?? 'Member';
      const approver = c.approver?.full_name;
      const reason = same(approver, payer) ? 'Self-verified'
        : c.is_walk_in && same(approver, c.recorder?.full_name) ? 'Recorded and verified by one officer'
        : null;
      if (reason) out.push({ key: `c-${c.id}`, title: `${payer} · Contribution`, sub: reason, flag: { type: 'contribution', id: c.id, label: `${payer}'s contribution` } });
    });

    (repayments.data ?? []).filter((p) => p.status === 'paid').forEach((p) => {
      const borrower = p.loans?.membership?.members?.full_name ?? 'Member';
      const verifier = p.verifier?.full_name;
      const reason = same(verifier, borrower) ? 'Self-verified'
        : same(verifier, p.recorder?.full_name) ? 'Recorded and verified by one officer'
        : null;
      if (reason) out.push({ key: `p-${p.id}`, title: `${borrower} · Repayment`, sub: reason, flag: { type: 'loan_payment', id: p.id, label: `${borrower}'s repayment` } });
    });

    // Once the Auditor has flagged it, it's counted under Open flags instead.
    return out.filter((c) => !flaggedIds.has(c.flag.id));
  }, [loanAudits.data, contribs.data, repayments.data, flaggedIds]);

  return { checks, loading: loanAudits.loading || contribs.loading || repayments.loading };
}

function WarningCard({ check, onPress }: { check: FailedCheck; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: intent.danger.soft, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 }}>
      <AlertTriangle size={16} color={intent.danger.text} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{check.title}</Text>
        <Text style={{ fontSize: 11, color: intent.danger.text }} numberOfLines={1}>{check.sub}</Text>
      </View>
      <ChevronRight size={16} color={intent.danger.text} />
    </Pressable>
  );
}

/** Counts behind the stat tiles, warning cards and Audit tools — one fetch each. */
function useAuditorOverview(groupId: string, data: ReturnType<typeof useAuditorData>) {
  const { member } = data;
  const [since] = useState(() => new Date(Date.now() - TRAIL_DAYS * 86400000).toISOString());
  const trail = useAuditTrailSince(groupId, since);
  const findings = useFindings(groupId, 'open');
  const flags = useFlags(groupId);

  const stats = useMemo(() => {
    const entries = trail.data?.entries ?? [];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    return entries.filter((e) => e.actor_id === member?.id && VERIFY_ACTIONS.has(`${e.action}:${e.entity_type}`) && new Date(e.created_at) >= monthStart).length;
  }, [trail.data, member?.id]);

  // Any flag, open or closed, takes a record off the failed-check cards — a dismissed one was looked at and found fine.
  const flaggedIds = useMemo(() => new Set((flags.data ?? []).map((f) => f.entity_id)), [flags.data]);
  const failed = useFailedChecks(groupId, data, flaggedIds);
  const trailReady = !!trail.data || (!trail.loading && !!trail.error);
  const flagsReady = !!flags.data || (!flags.loading && !!flags.error);
  const openFlags = flagsReady ? (flags.data ?? []).filter((f) => f.status === 'open').length : null;
  const openFindings = findings.data ? findings.data.length : findings.loading ? null : 0;

  return { verified: trailReady ? stats : null, openFlags, openFindings, failed: flagsReady && !failed.loading ? failed.checks : null };
}

function OverviewTiles({ groupId, overview, go }: { groupId: string; overview: ReturnType<typeof useAuditorOverview>; go: (r: string, params?: Record<string, string>) => void }) {
  const flag = useFlagPrompt(groupId);

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <StatTile value={overview.openFlags} label="Open flags" onPress={() => go('audit/flags')} />
        <StatTile value={overview.openFindings} label="Findings with the Organizer" onPress={() => go('audit/flags', { tab: 'findings' })} />
        <StatTile value={overview.verified} label="Verified by you this month" onPress={() => go('ledger')} />
      </View>

      {(overview.failed ?? []).map((c) => (
        <WarningCard key={c.key} check={c} onPress={() => (c.open ? go(c.open.route, c.open.params) : flag.open({ ...c.flag, reason: 'Broke a sign-off rule' }))} />
      ))}
      {flag.prompt}
    </>
  );
}

/* ---------------- Audit tools (same tiles as the Member's Shortcuts) ---------------- */
function ToolTile({ Icon, label, badge, onPress, busy }: { Icon: any; label: string; badge?: number; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[{ width: '23%', borderRadius: 18, backgroundColor: semantic.card, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, shadowToken.soft]}
    >
      {busy ? <ActivityIndicator color={NAV_BG} style={{ height: 26 }} /> : <Icon size={26} color={NAV_BG} strokeWidth={1.8} />}
      <Text variant="caption" style={{ textAlign: 'center', fontSize: 10, lineHeight: 14 }} numberOfLines={2}>{label}</Text>
      {badge ? (
        <View style={{ position: 'absolute', top: 8, right: 8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: intent.danger.base, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function AuditTools({ groupId, overview, go }: { groupId: string; overview: ReturnType<typeof useAuditorOverview>; go: (r: string) => void }) {
  const loanFails = overview.failed?.filter((c) => c.flag.type === 'loan' || c.flag.type === 'loan_disbursement').length ?? 0;
  const openItems = (overview.openFlags ?? 0) + (overview.openFindings ?? 0);

  return (
    <>
      <SectionHead title="Audit tools" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <ToolTile Icon={Banknote} label="Loan audits" badge={loanFails} onPress={() => go('audit/loans')} />
        <ToolTile Icon={Flag} label="Flags & findings" badge={openItems} onPress={() => go('audit/flags')} />
        <ToolTile Icon={Clock} label="Audit trail" onPress={() => go('audit/log')} />
        <ToolTile Icon={Download} label="Export report" onPress={() => go('audit/export')} />
      </View>
    </>
  );
}

/* ---------------- Recent activity (timeline) ---------------- */
const RECENT_SHOWN = 3;

function RecentActivity({ groupId, onOpen }: { groupId: string; onOpen: (id: string, at: string) => void }) {
  const log = useAuditLog(groupId, { limit: RECENT_SHOWN });
  const entries = log.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16, marginTop: 8 }, shadowToken.soft]}>
      {log.loading && entries.length === 0 ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 8 }} />
      ) : entries.length === 0 ? (
        <Text variant="body" color="muted">No activity yet.</Text>
      ) : (
        <AuditTimeline entries={entries} onOpen={(e) => onOpen(e.id, e.created_at)} />
      )}
    </View>
  );
}

/* ---------------- Year-end verification ---------------- */
function Gate({ done, now, label }: { done: boolean; now?: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#3DD68C' : now ? '#2FA8FF' : 'rgba(255,255,255,0.16)' }}>
        {done ? <Check size={11} color="#0B3323" strokeWidth={3} /> : null}
      </View>
      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: done || now ? '#C4D9E2' : '#8FA9B5' }}>{label}</Text>
    </View>
  );
}

function YearEndVerification({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { data, refetch } = useDistributions(groupId);
  const verify = useVerifyDistribution(groupId);
  const cancel = useCancelDistribution(groupId);

  const current = useMemo(() => (data ?? []).find((d) => d.status === 'previewed') ?? null, [data]);
  if (!current) return null;

  async function onVerify() {
    const ok = await verify.run(current!.id);
    if (ok) refetch();
  }
  async function onReturn() {
    const ok = await cancel.run(current!.id);
    if (ok) refetch();
  }

  return (
    <>
      <SectionHead title="Year-end preview" aside="Organizer is waiting" tone="hot" />
      <View style={{ backgroundColor: semantic.dashCard, borderRadius: 20, padding: 16 }}>
        <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Verify the distribution figures</Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: '#A9C4CF', marginTop: 6 }}>
          The Treasurer prepared this preview. Nothing is paid out until you verify and the Organizer finalizes.
        </Text>

        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.13)', flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: '#A9C4CF' }}>Total to distribute · {current.period}</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(current.total_amount)}</Text>
        </View>

        <View style={{ marginTop: 14, gap: 9 }}>
          <Gate done label={`Preview prepared by Treasurer · ${shortDate(current.created_at)}`} />
          <Gate done={false} now label="Your verification" />
          <Gate done={false} label="Organizer finalizes — becomes permanent" />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable disabled={cancel.loading} onPress={onReturn} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.11)' }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#C4D9E2' }}>Return to Treasurer</Text>
          </Pressable>
          <Pressable disabled={verify.loading} onPress={() => go('distribution/year-end')} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: semantic.surfaceAlt }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Open full breakdown</Text>
          </Pressable>
        </View>
        <Pressable disabled={verify.loading} onPress={onVerify} style={{ marginTop: 8, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#2FA8FF' }}>
          <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: '#052A47' }}>{verify.loading ? 'Verifying…' : 'Verify this preview'}</Text>
        </Pressable>
      </View>
    </>
  );
}

export function AuditorHero({ groupId }: { groupId: string }) {
  return (
    <DashboardBand>
      <VerificationHero groupId={groupId} />
    </DashboardBand>
  );
}

export function AuditorDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string, params?: Record<string, string>) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId, ...params } });
  const data = useAuditorData(groupId);
  const overview = useAuditorOverview(groupId, data);

  return (
    <>
      <YearEndVerification groupId={groupId} go={go} />

      <OverviewTiles groupId={groupId} overview={overview} go={go} />

      <AuditTools groupId={groupId} overview={overview} go={go} />

      <SectionHead title="Recent activity" aside="See audit trail" onAsidePress={() => go('audit/log')} />
      <RecentActivity
        groupId={groupId}
        onOpen={(id, at) => router.push({ pathname: '/(app)/[groupId]/audit/[id]' as any, params: { groupId, id, at } })}
      />
    </>
  );
}
