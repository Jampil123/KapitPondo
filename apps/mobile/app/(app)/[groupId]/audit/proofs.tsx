import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Image, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Search, Rows3, LayoutGrid, Receipt, Flag, Send } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { FlagPrompt } from '@/features/flags/FlagPrompt';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useRepayments } from '@/features/lending/lending.hooks';
import { useFlagPosting, useAskForProof } from '@/features/auditlog/auditlog.hooks';
import type { ProofEntityType } from '@/api/auditLog';

type ViewMode = 'list' | 'grid';
type FilterKey = 'all' | 'none' | 'contribution' | 'loan_payment';
type Outcome = 'posted' | 'rejected' | 'pending';

interface ProofItem {
  id: string;
  entityType: ProofEntityType;
  kind: string;
  name: string;
  reference: string | null;
  amount: string | number;
  date: string;
  proofUrl: string | null;
  recordedByName: string | null;
  recordedById: string | null;
  verifiedByName: string | null;
  outcome: Outcome;
}

const OUTCOME: Record<Outcome, { label: string; soft: string; text: string }> = {
  posted: { label: 'Posted', soft: intent.success.soft, text: intent.success.text },
  rejected: { label: 'Returned', soft: intent.danger.soft, text: intent.danger.text },
  pending: { label: 'Under review', soft: intent.info.soft, text: intent.info.text },
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function Chip({ soft, text, label }: { soft: string; text: string; label: string }) {
  return (
    <View style={{ backgroundColor: soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: text }}>{label}</Text>
    </View>
  );
}

function SmallButton({ label, tone, Icon, onPress, disabled }: { label: string; tone: 'ok' | 'danger'; Icon: any; onPress: () => void; disabled?: boolean }) {
  const t = tone === 'ok' ? { bg: semantic.brandDark, fg: '#fff' } : { bg: intent.danger.soft, fg: intent.danger.text };
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.bg, borderRadius: 9, paddingVertical: 5, paddingHorizontal: 10, opacity: disabled ? 0.5 : 1 }}>
      <Icon size={11} color={t.fg} strokeWidth={2.6} />
      <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: t.fg }}>{label}</Text>
    </Pressable>
  );
}

/** The proof photo itself, or an empty receipt tile when nothing is attached. */
function Thumb({ url, size }: { url: string | null; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Receipt size={size / 3} color={semantic.textMuted} strokeWidth={1.5} />
      )}
    </View>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, backgroundColor: semantic.surface, borderRadius: 12, padding: 3 }}>
      {([['list', Rows3], ['grid', LayoutGrid]] as const).map(([mode, Icon]) => (
        <Pressable
          key={mode}
          onPress={() => onChange(mode)}
          accessibilityLabel={mode === 'list' ? 'List view' : 'Grid view'}
          style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: view === mode ? semantic.surfaceAlt : 'transparent' }}
        >
          <Icon size={15} color={semantic.brandDark} />
        </Pressable>
      ))}
    </View>
  );
}

export default function ReviewProofs() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const open = (i: ProofItem) => router.push({ pathname: '/(app)/[groupId]/audit/proof/[id]' as any, params: { groupId, id: i.id, type: i.entityType } });
  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const contribs = useContributions(groupId!, {});
  const repayments = useRepayments(groupId!);
  const flag = useFlagPosting(groupId!);
  const ask = useAskForProof(groupId!);

  const loading = contribs.loading || repayments.loading;

  // Only real payments carry proof — 'late'/'pending' contribution rows are missed-period markers, not payments.
  const items: ProofItem[] = useMemo(() => {
    const cs: ProofItem[] = (contribs.data ?? [])
      .filter((c) => c.status === 'submitted' || c.status === 'confirmed' || c.status === 'approved' || c.status === 'rejected')
      .map((c) => ({
        id: c.id, entityType: 'contribution', kind: 'Contribution',
        name: c.memberships?.members?.full_name ?? 'Member', reference: c.external_reference,
        amount: c.amount, date: c.created_at, proofUrl: c.proof_signed_url,
        recordedByName: c.recorder?.full_name ?? null, recordedById: c.recorded_by,
        verifiedByName: c.approver?.full_name ?? null,
        outcome: c.status === 'approved' ? 'posted' : c.status === 'rejected' ? 'rejected' : 'pending',
      }));
    const ps: ProofItem[] = (repayments.data ?? []).map((p) => ({
      id: p.id, entityType: 'loan_payment', kind: 'Repayment',
      name: p.loans?.membership?.members?.full_name ?? 'Member', reference: p.external_reference,
      amount: p.amount, date: p.created_at, proofUrl: p.proof_signed_url,
      recordedByName: p.recorder?.full_name ?? null, recordedById: p.recorded_by,
      verifiedByName: p.verifier?.full_name ?? null,
      outcome: p.status === 'paid' ? 'posted' : p.status === 'rejected' ? 'rejected' : 'pending',
    }));
    return [...cs, ...ps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [contribs.data, repayments.data]);

  const missingProof = useMemo(() => items.filter((i) => i.outcome === 'posted' && !i.proofUrl), [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'none') list = missingProof;
    else if (filter !== 'all') list = list.filter((i) => i.entityType === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.reference ?? '').toLowerCase().includes(q) ||
        String(i.amount).includes(q) ||
        (i.recordedByName ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filter, missingProof, search]);

  const [flagTarget, setFlagTarget] = useState<ProofItem | null>(null);
  async function onFlagConfirm(reason: string, note: string) {
    if (!flagTarget) return;
    const target = flagTarget;
    setFlagTarget(null);
    const ok = await flag.run({ entity_type: target.entityType, entity_id: target.id, reason, note: note || undefined, label: `${target.kind} · ${target.name} · ${formatPeso(target.amount)}` });
    if (ok === undefined) Alert.alert('Could not flag', flag.error?.message ?? 'Try again.');
    else toast('Flagged — the Organizer has been notified');
  }

  function onAsk(item: ProofItem) {
    if (!item.recordedById) return;
    Alert.alert('Request proof', `Ask ${item.recordedByName ?? 'the recorder'} to attach a receipt?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Request', onPress: async () => {
          const ok = await ask.run({ entity_type: item.entityType, entity_id: item.id, recorded_by: item.recordedById!, label: `${item.kind} · ${item.name} · ${formatPeso(item.amount)}` });
          if (ok === undefined) Alert.alert('Could not send', ask.error?.message ?? 'Try again.');
          else toast(`Proof requested from ${item.recordedByName ?? 'the recorder'}`);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Proofs" right={<ViewToggle view={view} onChange={setView} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 14, paddingHorizontal: 14, height: 46 }}>
          <Search size={16} color={semantic.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by member, amount or reference"
            placeholderTextColor={semantic.textMuted}
            style={{ flex: 1, fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}
          />
        </View>

        <View style={{ marginTop: 14 }}>
          <PillFilters<FilterKey>
            options={[
              { key: 'all', label: 'All' },
              { key: 'none', label: 'No proof', count: missingProof.length, hot: missingProof.length > 0 },
              { key: 'contribution', label: 'Contributions' },
              { key: 'loan_payment', label: 'Repayments' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>

        {loading && items.length === 0 ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text variant="body" color="secondary">No postings match this view.</Text>
          </View>
        ) : view === 'list' ? (
          <View style={{ marginTop: 8 }}>
            {filtered.map((i) => {
              const o = OUTCOME[i.outcome];
              const missing = i.outcome === 'posted' && !i.proofUrl;
              return (
                <Pressable key={i.id} onPress={() => open(i)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: semantic.border }}>
                  <Thumb url={i.proofUrl} size={52} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{i.name}</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(i.amount)}</Text>
                    </View>
                    <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                      {[i.kind, shortDate(i.date), i.reference ? `ref ${i.reference}` : null].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Chip soft={o.soft} text={o.text} label={o.label} />
                      {missing ? <Chip soft={intent.danger.soft} text={intent.danger.text} label="No proof" /> : null}
                      <View style={{ flex: 1 }} />
                      {missing && i.recordedById ? <SmallButton label="Request" tone="ok" Icon={Send} onPress={() => onAsk(i)} disabled={ask.loading} /> : null}
                      {i.outcome === 'posted' ? <SmallButton label="Flag" tone="danger" Icon={Flag} onPress={() => setFlagTarget(i)} disabled={flag.loading} /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            {filtered.map((i) => (
              <Pressable key={i.id} onPress={() => open(i)} style={{ width: '31%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
                {i.proofUrl ? (
                  <Image source={{ uri: i.proofUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Receipt size={20} color={semantic.textMuted} strokeWidth={1.5} />
                  </View>
                )}
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, backgroundColor: 'rgba(9,32,42,0.72)' }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#fff' }} numberOfLines={1}>{i.name}</Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#fff' }} numberOfLines={1}>{formatPeso(i.amount)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <FlagPrompt
        visible={!!flagTarget}
        title={flagTarget ? `Flag ${flagTarget.name}'s ${flagTarget.kind.toLowerCase()}` : 'Flag posting'}
        onCancel={() => setFlagTarget(null)}
        onConfirm={onFlagConfirm}
      />
    </SafeAreaView>
  );
}
