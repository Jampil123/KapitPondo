/**
 * app/(app)/[groupId]/audit/proofs.tsx — auditor reviews uploaded proofs.
 * Gathers items that have a proof_url (contributions + expenses), shows them in
 * a filterable grid; tapping opens the full image.
 *
 * NOTE: proofs live in a PRIVATE bucket, so proof_url is usually a storage path,
 * not a public link. To render it you need a signed URL. This screen shows the
 * image when proof_url is already a full URL, otherwise a placeholder tile —
 * swap in a signed-URL fetch when wiring against the real storage.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Image, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Receipt, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useExpenses } from '@/features/expenses/expenses.hooks';

type Filter = 'all' | 'contributions' | 'expenses';
type Proof = { id: string; kind: 'Contribution' | 'Expense'; txn: string; amount: string | number; url: string };

function cName(c: any) { return c.member_name ?? c.members?.full_name ?? c.member?.full_name ?? 'Member'; }
function isUrl(s: string) { return /^https?:\/\//.test(s); }

export default function ReviewProofs() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Proof | null>(null);

  const contribs = useContributions(groupId!, {});
  const expenses = useExpenses(groupId!, {});

  const proofs: Proof[] = useMemo(() => {
    const cs = (contribs.data ?? []).filter((c: any) => c.proof_url).map((c: any): Proof => ({ id: c.id, kind: 'Contribution', txn: cName(c), amount: c.amount, url: c.proof_url }));
    const es = (expenses.data ?? []).filter((e: any) => e.proof_url).map((e: any): Proof => ({ id: e.id, kind: 'Expense', txn: e.description ?? 'Expense', amount: e.amount, url: e.proof_url }));
    const all = [...cs, ...es];
    return filter === 'all' ? all : filter === 'contributions' ? cs : es;
  }, [contribs.data, expenses.data, filter]);

  const loading = contribs.loading || expenses.loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Review Proofs" subtitle="Auditor" />
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        <Segmented<Filter>
          options={[{ key: 'all', label: 'All' }, { key: 'contributions', label: 'Contributions' }, { key: 'expenses', label: 'Expenses' }]}
          value={filter}
          onChange={setFilter}
        />

        {loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} /> :
        proofs.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 44, gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={26} color={semantic.textMuted} />
            </View>
            <Text variant="h3" style={{ fontSize: 16 }}>No proofs</Text>
            <Text variant="body" color="secondary">Uploaded proofs will appear here.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {proofs.map((p) => (
                <Pressable key={`${p.kind}-${p.id}`} onPress={() => setOpen(p)} style={[{ width: '47.5%', backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
                  {isUrl(p.url) ? (
                    <Image source={{ uri: p.url }} style={{ width: '100%', height: 108 }} resizeMode="cover" />
                  ) : (
                    <View style={{ height: 108, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Receipt size={32} color={semantic.brand} />
                    </View>
                  )}
                  <View style={{ padding: 11, gap: 3 }}>
                    <Text variant="label" style={{ fontSize: 12 }} numberOfLines={1}>{p.txn}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="caption" color="muted">{p.kind}</Text>
                      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(p.amount)}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Full proof viewer */}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setOpen(null)}>
          <View style={{ width: '100%', backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text variant="label">{open?.txn}</Text>
                <Text variant="caption" color="secondary">{open?.kind} · {formatPeso(open?.amount)}</Text>
              </View>
              <Pressable onPress={() => setOpen(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {open && isUrl(open.url) ? (
              <Image source={{ uri: open.url }} style={{ width: '100%', height: 360 }} resizeMode="contain" />
            ) : (
              <View style={{ height: 220, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Receipt size={40} color={semantic.brand} />
                <Text variant="caption" color="secondary">Proof stored privately — needs a signed URL to display.</Text>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
