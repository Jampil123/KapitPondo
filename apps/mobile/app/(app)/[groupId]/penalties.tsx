/**
 * app/(app)/[groupId]/penalties.tsx — Penalties Review (M5.4, TC-017/TC-039).
 * Wired to the real API: list → usePenalties(groupId, status); waive → a
 * required-reason prompt calling useWaivePenalty (Owner only — the backend
 * 403s anyone else, but there's nothing gating the button client-side here
 * since only the Owner's own dashboard links to this screen).
 *
 * There's still no "pay it off" flow (see api/penalties.ts — `ledger_entry_id`
 * is only ever set once a penalty is actually paid, and nothing does that
 * yet), so a pending penalty can currently only be resolved by waiving it.
 */
import { useState } from 'react';
import { View, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { usePenalties, useWaivePenalty } from '@/features/penalties/penalties.hooks';
import type { Penalty } from '@/api/penalties';

type Tab = 'active' | 'waived';

function memberName(p: Penalty): string {
  return p.membership?.members?.full_name ?? 'Member';
}
function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Penalties() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [tab, setTab] = useState<Tab>('active');

  const pending = usePenalties(groupId!, 'pending');
  const list = usePenalties(groupId!, tab === 'active' ? 'pending' : 'waived');
  const waive = useWaivePenalty(groupId!);
  const [waiveTarget, setWaiveTarget] = useState<Penalty | null>(null);

  const pendingTotal = (pending.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const rows = list.data ?? [];

  async function onWaiveConfirm(reason: string) {
    if (!waiveTarget) return;
    if (!reason.trim()) { Alert.alert('Reason required', 'Enter a reason to waive this penalty.'); return; }
    const ok = await waive.run(waiveTarget.id, reason.trim());
    setWaiveTarget(null);
    if (ok !== undefined) { list.refetch(); pending.refetch(); }
    else if (waive.error) Alert.alert('Could not waive', waive.error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Penalties Review" subtitle="Organizer" />
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: semantic.surfaceAlt, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" color="secondary">Pending penalties</Text>
            {pending.loading ? <ActivityIndicator /> : <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(pendingTotal)}</Text>}
          </View>
          <AlertTriangle size={22} color="#A87C2C" />
        </View>

        <Segmented<Tab>
          options={[{ key: 'active', label: 'Active', count: pending.data?.length ?? 0 }, { key: 'waived', label: 'Waived' }]}
          value={tab}
          onChange={setTab}
        />

        {list.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} />
        ) : rows.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={26} color={semantic.textMuted} />
            </View>
            <Text variant="h3" style={{ fontSize: 16 }}>{tab === 'active' ? 'No active penalties' : 'Nothing waived yet'}</Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {tab === 'active' ? 'Late-contribution penalties will show up here automatically.' : 'Penalties you waive will show up here.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {rows.map((p) => (
              <View key={p.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Avatar name={memberName(p)} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label" style={{ fontSize: 14.5 }}>{memberName(p)}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>{p.reason}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#A87C2C' }}>{formatPeso(p.amount)}</Text>
                    <Text variant="caption" color="secondary">{shortDate(p.created_at)}</Text>
                  </View>
                </View>
                {tab === 'active' ? (
                  <Button
                    label="Waive"
                    variant="ghost"
                    onPress={() => setWaiveTarget(p)}
                    style={{ marginTop: 12, paddingVertical: 10 }}
                  />
                ) : (
                  <Text variant="caption" color="muted" style={{ marginTop: 10 }}>
                    Waived {shortDate(p.waived_at)}{p.waive_reason ? ` — ${p.waive_reason}` : ''}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      <ReasonPrompt
        visible={!!waiveTarget}
        title={waiveTarget ? `Waive ${memberName(waiveTarget)}'s penalty?` : 'Waive penalty'}
        placeholder="Reason for waiving this penalty (required)"
        confirmLabel="Waive"
        onCancel={() => setWaiveTarget(null)}
        onConfirm={onWaiveConfirm}
      />
    </SafeAreaView>
  );
}
