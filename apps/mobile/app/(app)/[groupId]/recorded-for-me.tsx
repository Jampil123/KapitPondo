import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Flag } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { BandHeader } from '@/components/shared/DashboardBand';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useContributions, useDisputeContribution } from '@/features/contributions/contributions.hooks';
import { useRepayments, useDisputeRepayment } from '@/features/lending/lending.hooks';

type Row = { key: string; kind: 'contribution' | 'repayment'; id: string; amount: string | number; date: string; recorder: string; status: string };

function day(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Cash an officer recorded on the member's behalf (walk-ins). The member is the
 * third check on these: if one's wrong, "This isn't right" raises a flag for
 * the Auditor. Opened from the walk-in notification.
 */
export default function RecordedForMe() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { member } = useAuth();
  const contribs = useContributions(groupId!, {});
  const repayments = useRepayments(groupId!);
  const disputeContribution = useDisputeContribution(groupId!);
  const disputeRepayment = useDisputeRepayment(groupId!);
  const [target, setTarget] = useState<Row | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());

  const rows: Row[] = useMemo(() => [
    ...(contribs.data ?? [])
      .filter((c) => c.is_walk_in && c.recorded_by && c.recorded_by !== member?.id)
      .map((c): Row => ({ key: `c-${c.id}`, kind: 'contribution', id: c.id, amount: c.amount, date: c.created_at, recorder: c.recorder?.full_name ?? 'An officer', status: c.status })),
    ...(repayments.data ?? [])
      .filter((p) => p.is_walk_in && p.recorded_by && p.recorded_by !== member?.id)
      .map((p): Row => ({ key: `p-${p.id}`, kind: 'repayment', id: p.id, amount: p.amount, date: p.created_at, recorder: p.recorder?.full_name ?? 'An officer', status: p.status })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)), [contribs.data, repayments.data, member?.id]);

  async function onReport(note: string) {
    if (!target) return;
    const r = target;
    setTarget(null);
    const action = r.kind === 'contribution' ? disputeContribution : disputeRepayment;
    const ok = await action.run(r.id, note || undefined);
    if (ok === undefined) {
      Alert.alert('Could not report', action.error?.message ?? 'Try again.');
      return;
    }
    setReported((s) => new Set(s).add(r.key));
    toast('Reported to the Auditor');
  }

  const loading = (contribs.loading || repayments.loading) && rows.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Recorded for you" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text variant="caption" color="secondary" style={{ lineHeight: 17, paddingHorizontal: 2 }}>
          Cash an officer recorded on your behalf. If an amount or date is wrong, tell the Auditor.
        </Text>
        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, marginTop: 12, overflow: 'hidden' }, shadowToken.soft]}>
          {loading ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 24 }} />
          ) : rows.length === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>Nothing recorded for you yet.</Text>
          ) : rows.map((r, i) => (
            <View key={r.key} style={{ padding: 14, gap: 10, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>
                    {r.kind === 'contribution' ? 'Contribution' : 'Loan repayment'} · {formatPeso(r.amount)}
                  </Text>
                  <Text variant="caption" color="secondary">Recorded by {r.recorder} · {day(r.date)}</Text>
                </View>
                <StatusBadge entity={r.kind === 'contribution' ? 'contribution' : 'loanPayment'} value={r.status} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                {reported.has(r.key) ? (
                  <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>Reported to the Auditor</Text>
                ) : (
                  <Pressable onPress={() => setTarget(r)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent.danger.soft, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 11 }}>
                    <Flag size={12} color={intent.danger.text} />
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>This isn’t right</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <ReasonPrompt
        visible={!!target}
        title="What’s not right?"
        placeholder="e.g. I paid ₱300, not ₱500 (optional)"
        confirmLabel="Report"
        destructive
        onCancel={() => setTarget(null)}
        onConfirm={onReport}
      />
    </SafeAreaView>
  );
}
