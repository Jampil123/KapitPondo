/**
 * app/(app)/[groupId]/year-end.tsx
 * ----------------------------------------------------------------------------
 * Year-end distribution (M9). Designer's layout, wired to API:
 *   summary numbers → useSummary
 *   build preview   → usePreviewDistribution(period)  (owner/treasurer)
 *   verify          → useVerifyDistribution(id)        (auditor)
 *   finalize        → useFinalizeDistribution(id)      (owner; immutable)
 *
 * The Treasurer✓ / Auditor✓ two-step lock is real now: a preview must be
 * verified by an Auditor before the Owner can finalize it (the server
 * enforces this — finalize 409s otherwise). This one screen surfaces both
 * the Preview and Verify actions; each is still gated server-side to the
 * right role regardless of who's looking at it.
 */
import { useState } from 'react';
import { View, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Lock, Unlock, ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { usePreviewDistribution, useVerifyDistribution, useFinalizeDistribution } from '@/features/distribution/distribution.hooks';
import type { Distribution, DistributionAllocation } from '@/api/distribution';

function allocName(a: any): string {
  return a.member_name ?? a.members?.full_name ?? a.member?.full_name ?? 'Member';
}

export default function YearEnd() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const summary = useSummary(groupId!);
  const preview = usePreviewDistribution(groupId!);
  const verify = useVerifyDistribution(groupId!);
  const finalize = useFinalizeDistribution(groupId!);

  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [dist, setDist] = useState<Distribution | null>(null);
  const [allocs, setAllocs] = useState<DistributionAllocation[]>([]);

  const s = summary.data;
  // interest/penalty income aren't tracked as separate ledger categories yet (M8 gap) —
  // these have always been 0 here, this just makes that explicit instead of reading
  // fields that don't exist on the real GroupSummary response.
  const netIncome = 0 - Number(s?.total_expenses ?? 0);
  const distributable = Number(s?.total_contributions ?? 0) + netIncome;

  const awaitingVerification = !!dist && dist.status === 'previewed';
  const ready = !!dist && dist.status === 'verified';
  const finalized = dist?.status === 'finalized';
  const LockIcon = ready || finalized ? Unlock : Lock;

  async function onPreview() {
    const res = await preview.run(period.trim());
    if (res) { setDist(res.distribution); setAllocs(res.allocations ?? []); }
    else if (preview.error) Alert.alert('Preview failed', preview.error.message);
  }

  async function onVerify() {
    if (!dist) return;
    const res = await verify.run(dist.id);
    if (res) setDist(res.distribution);
    else if (verify.error) Alert.alert('Could not verify', verify.error.message);
  }

  function onFinalize() {
    if (!dist) return;
    Alert.alert('Finalize distribution', 'This pays out every member, drives the fund to zero, and closes the cycle. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finalize',
        style: 'destructive',
        onPress: async () => {
          const res = await finalize.run(dist.id);
          if (res) { setDist(res.distribution); setAllocs(res.allocations ?? []); Alert.alert('Done', 'Distribution finalized.'); }
          else if (finalize.error) {
            Alert.alert('Could not finalize', finalize.error.status === 409
              ? 'The fund changed since the preview. Re-run the preview, then finalize.'
              : finalize.error.message);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Year-End Distribution" subtitle="Organizer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {/* Distributable summary */}
        <View style={{ borderRadius: 18, padding: 16, backgroundColor: semantic.brand }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Total distributable fund</Text>
          {summary.loading ? (
            <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 30, fontFamily: 'Poppins_700Bold', color: '#fff', marginTop: 4, marginBottom: 12 }}>{formatPeso(distributable)}</Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              ['Contributions', formatPeso(s?.total_contributions)],
              ['Interest earned', formatPeso(0)],
              ['Penalties', formatPeso(0)],
              ['Expenses', `-${formatPeso(s?.total_expenses)}`],
            ].map(([k, v]) => (
              <View key={k} style={{ width: '47%', gap: 1 }}>
                <Text style={{ fontSize: 11, color: '#fff', opacity: 0.8 }}>{k}</Text>
                <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Period + preview */}
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, gap: 10 }, shadowToken.card]}>
          <Text variant="overline" color="secondary">Period</Text>
          <TextInput value={period} onChangeText={setPeriod} placeholder="2026" placeholderTextColor={semantic.textMuted} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 48, fontFamily: 'Poppins_500Medium', fontSize: 15, color: semantic.textPrimary }} />
          <Button label={ready ? 'Rebuild preview' : 'Build preview'} variant="ghost" onPress={onPreview} loading={preview.loading} />
        </View>

        {/* Lock state */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: ready || finalized ? '#E2F0E8' : '#F8EFDA', borderRadius: 14, padding: 14 }}>
          <LockIcon size={20} color={ready || finalized ? '#3E8E66' : '#A87C2C'} />
          <Text variant="label" style={{ flex: 1, color: ready || finalized ? '#3E8E66' : '#A87C2C' }}>
            {finalized ? 'Finalized' : ready ? 'Verified — Owner can finalize' : awaitingVerification ? 'Awaiting Auditor verification' : 'Build a preview first'}
          </Text>
        </View>

        {/* Auditor verification step */}
        {awaitingVerification && (
          <Button
            label="Verify preview (Auditor)"
            variant="ghost"
            onPress={onVerify}
            loading={verify.loading}
            leading={<ShieldCheck size={18} color={semantic.brandDark} />}
          />
        )}

        {/* Allocations */}
        {allocs.length > 0 && (
          <View>
            <Text variant="h3" style={{ fontSize: 15, marginTop: 8, marginBottom: 12 }}>Per-member distribution</Text>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 6 }, shadowToken.card]}>
              {allocs.map((a, i) => (
                <View key={a.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < allocs.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                  <Avatar name={allocName(a)} size={36} />
                  <Text variant="label" style={{ flex: 1, fontSize: 13.5 }}>{allocName(a)}</Text>
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: '#3E8E66' }}>{formatPeso(a.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Button
          label={finalized ? 'Cycle finalized ✓' : 'Finalize distribution'}
          onPress={onFinalize}
          loading={finalize.loading}
          disabled={!ready || finalized}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
