/**
 * app/(app)/[groupId]/distribution/year-end.tsx
 * ----------------------------------------------------------------------------
 * Year-end distribution (M9). Flow: Owner/Treasurer preview -> Auditor
 * verifies -> Owner finalizes (immutable — posts payouts, drives the fund to
 * 0, locks the distribution). Redesigned per the "owner-year-end" reference,
 * but every figure on screen is real:
 *
 *   summary + status      -> the current distribution row (useDistributions)
 *   approval chain         -> distribution.created_at / verified_at / finalized_at
 *   per-member payouts      -> useDistribution's joined allocations (name, heads, amount)
 *   fund-changed warning    -> live available_cash vs the previewed total_amount
 *                              (the same check finalize_distribution enforces server-side —
 *                              surfaced here BEFORE you tap Finalize, not just as a 409 after)
 *   unreviewed penalties    -> usePenalties(groupId, 'pending')
 *
 * Deliberately NOT shown: a capital/profit/loan/penalty breakdown per member.
 * preview_distribution (migration 0002/0028) computes a single flat share —
 * `available_cash * heads / total_heads` — with no separate capital, profit,
 * or per-member loan/penalty netting anywhere server-side. Showing that
 * breakdown would display numbers the system never actually calculates.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Check, AlertTriangle, CalendarClock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { formatPeso } from '@/lib/money';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { usePenalties } from '@/features/penalties/penalties.hooks';
import {
  useDistributions, useDistribution, usePreviewDistribution, useVerifyDistribution, useFinalizeDistribution,
} from '@/features/distribution/distribution.hooks';

const cardStyle = [{ backgroundColor: semantic.surface, borderRadius: 20 }, shadowToken.card] as const;

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

function Gate({ state, label, sub }: { state: 'done' | 'now' | 'wait'; label: string; sub?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{
        width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
        backgroundColor: state === 'done' ? intent.success.base : state === 'now' ? '#2FA8FF' : semantic.surfaceAlt,
      }}>
        {state === 'done' ? <Check size={12} color="#fff" strokeWidth={3} /> : (
          <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: state === 'now' ? '#052A47' : semantic.textMuted }}>{state === 'now' ? '•' : '·'}</Text>
        )}
      </View>
      <View style={{ flex: 1, paddingBottom: 2 }}>
        <Text variant="label" style={{ fontSize: 13.5, color: state === 'wait' ? semantic.textMuted : semantic.textPrimary }}>{label}</Text>
        {sub ? <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 16 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function YearEnd() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const summary = useSummary(groupId!);
  const distributions = useDistributions(groupId!);
  const pendingPenalties = usePenalties(groupId!, 'pending');
  const preview = usePreviewDistribution(groupId!);
  const verify = useVerifyDistribution(groupId!);
  const finalize = useFinalizeDistribution(groupId!);

  const [period, setPeriod] = useState(String(new Date().getFullYear()));

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

  const previewed = current?.status === 'previewed';
  const verified = current?.status === 'verified';
  const finalized = current?.status === 'finalized';

  const cashNow = Number(summary.data?.available_cash ?? 0);
  const cashAtPreview = current ? Number(current.total_amount) : 0;
  // Same tolerance finalize_distribution enforces server-side (migration 0028) —
  // surfaced here before the tap instead of only as a 409 after.
  const fundChanged = !!current && !finalized && Math.abs(cashNow - cashAtPreview) > 0.01;

  const pendingPenaltyCount = pendingPenalties.data?.length ?? 0;
  const totalHeads = allocations.reduce((s, a) => s + (a.memberships?.heads ?? 0), 0);

  async function onPreview() {
    const p = period.trim();
    if (!p) { Alert.alert('Period required', 'Enter a period label, e.g. "2026".'); return; }
    const res = await preview.run(p);
    if (res) distributions.refetch();
    else if (preview.error) Alert.alert('Could not build preview', preview.error.message);
  }

  async function onVerify() {
    if (!current) return;
    const res = await verify.run(current.id);
    if (res) { distributions.refetch(); detail.refetch(); }
    else if (verify.error) Alert.alert('Could not verify', verify.error.message);
  }

  function onFinalize() {
    if (!current) return;
    Alert.alert(
      `Finalize the ${current.period} distribution?`,
      `This posts ${formatPeso(current.total_amount)} across ${allocations.length} member${allocations.length === 1 ? '' : 's'}, notifies everyone, and locks it permanently. It cannot be undone — a mistake would need a new distribution to correct, not a reversal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize',
          style: 'destructive',
          onPress: async () => {
            const res = await finalize.run(current.id);
            if (res) { distributions.refetch(); detail.refetch(); }
            else if (finalize.error) {
              Alert.alert('Could not finalize', finalize.error.status === 409
                ? 'The fund changed since this preview, or it hasn\'t been verified yet. Rebuild the preview and try again.'
                : finalize.error.message);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Year-End Distribution" subtitle="Organizer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 4 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Summary ---------------- */}
        <View style={{ paddingHorizontal: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>
              {finalized ? 'Distributed' : current ? 'To be distributed' : 'No distribution yet'}
            </Text>
            {current ? <StatusPill status={current.status} /> : null}
          </View>
          {summary.loading && !current ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 32, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, letterSpacing: -1, marginTop: 6 }}>
              {formatPeso(current ? current.total_amount : cashNow)}
            </Text>
          )}
          <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
            {current
              ? `${allocations.length} member${allocations.length === 1 ? '' : 's'} · ${totalHeads} head${totalHeads === 1 ? '' : 's'} · ${finalized ? `paid ${shortDate(current.finalized_at)}` : 'nothing is paid until you finalize'}`
              : `${formatPeso(cashNow)} available cash · build a preview to split it by heads`}
          </Text>
        </View>

        {/* ---------------- Build / rebuild preview ---------------- */}
        <View style={[cardStyle, { padding: 14, gap: 10, marginTop: 18 }]}>
          <Text variant="overline" color="secondary">Period</Text>
          <TextInput value={period} onChangeText={setPeriod} placeholder="2026" placeholderTextColor={semantic.textMuted} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 48, fontFamily: 'Poppins_500Medium', fontSize: 15, color: semantic.textPrimary }} />
          <Button label={current && !finalized ? 'Rebuild preview' : 'Build preview'} variant="ghost" onPress={onPreview} loading={preview.loading} />
        </View>

        {current ? (
          <>
            {/* ---------------- Approval chain ---------------- */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>
                {finalized ? 'Approval trail' : 'Before you can finalize'}
              </Text>
            </View>
            <View style={[cardStyle, { padding: 16, gap: 16 }]}>
              <Gate
                state="done"
                label="Preview prepared"
                sub={`Built ${shortDate(current.created_at)}`}
              />
              <Gate
                state={verified || finalized ? 'done' : 'now'}
                label="Auditor verifies the figures"
                sub={verified || finalized ? `Verified ${shortDate(current.verified_at)}` : 'Checks the totals independently before you finalize'}
              />
              <Gate
                state={finalized ? 'done' : verified ? 'now' : 'wait'}
                label="You finalize"
                sub={finalized ? `Finalized ${shortDateTime(current.finalized_at)}` : 'Payouts are posted and this distribution locks permanently'}
              />
            </View>

            {/* ---------------- Fund changed warning ---------------- */}
            {fundChanged ? (
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
                    {pendingPenaltyCount} penalt{pendingPenaltyCount === 1 ? 'y' : 'ies'} still need{pendingPenaltyCount === 1 ? 's' : ''} your review
                  </Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>
                    Worth settling before you lock the cycle for good.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* ---------------- Locked banner ---------------- */}
            {finalized ? (
              <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: semantic.surfaceAlt, borderRadius: 16, padding: 14, marginTop: 14 }}>
                <CalendarClock size={18} color={semantic.brandDark} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" style={{ color: semantic.brandDark, fontSize: 12.5 }}>Finalized {shortDateTime(current.finalized_at)}</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>
                    These figures are permanent. Members have been notified.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* ---------------- Member payouts ---------------- */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>What each member receives</Text>
              <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{allocations.length} members</Text>
            </View>
            <View style={[cardStyle, { padding: 6 }]}>
              {detail.loading ? (
                <ActivityIndicator color={semantic.brand} style={{ margin: 20 }} />
              ) : allocations.length === 0 ? (
                <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No allocations on this preview.</Text>
              ) : (
                allocations.map((a, i) => {
                  const name = a.memberships?.members?.full_name ?? 'Member';
                  const heads = a.memberships?.heads ?? 0;
                  return (
                    <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < allocations.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <Avatar name={name} size={38} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{name}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>{heads} head{heads === 1 ? '' : 's'}</Text>
                      </View>
                      <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 15, color: semantic.dashCard }}>{formatPeso(a.amount)}</Text>
                    </View>
                  );
                })
              )}
            </View>

            <Text variant="caption" color="muted" style={{ marginTop: 16, lineHeight: 17, paddingHorizontal: 2 }}>
              {finalized
                ? 'This distribution is permanent. Members can see their own payout.'
                : 'Members can\'t see these figures until you finalize. Split proportionally by heads: available cash ÷ total heads × each member\'s heads.'}
            </Text>
          </>
        ) : null}
      </ScrollView>

      {current && !finalized ? (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 10, backgroundColor: semantic.background, borderTopWidth: 1, borderColor: semantic.border, gap: 10 }}>
          {previewed ? (
            <Button
              label="Verify preview (Auditor)"
              variant="ghost"
              onPress={onVerify}
              loading={verify.loading}
            />
          ) : null}
          <Button
            label={verified ? 'Finalize distribution' : 'Waiting on Auditor verification'}
            onPress={onFinalize}
            disabled={!verified || fundChanged}
            loading={finalize.loading}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
