/**
 * app/(app)/[groupId]/proofs.tsx — "My proofs" (member). A gallery/list of
 * every proof image the member has uploaded — contributions AND loan
 * repayments, combined, since they're separate flows in the system but the
 * same object to the member (a receipt they sent).
 *
 * Repayments now cover ALL of the member's loans, not just the active one —
 * the old version deliberately limited itself to the active loan to avoid an
 * N+1 fetch (one call per past loan). listRepayments() already returns every
 * repayment across a member's loans in one query (self-scoped server-side),
 * so that limitation no longer applies; using it here removes it for free.
 *
 * The footer note is deliberately narrower than the design's "Only you and
 * the group's officers can open them" — the `proofs` storage bucket's RLS
 * policy (migration 0012) actually allows any authenticated app user to read
 * a file if they have its exact path, not just the member and their group's
 * officers. Paths aren't exposed outside this member's own API responses, so
 * it's not public, but it's not the tighter guarantee the design's copy
 * claims either — said honestly instead of promising a boundary that isn't
 * enforced at the storage layer.
 *
 * LoanPayment gained `payment_method`/`external_reference` in this pass —
 * real columns on loan_payments (migration 0001) that the TS type simply
 * never declared, so the reference number shown here was never reachable.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Image, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Search, LayoutGrid, List, AlertTriangle, Check, Clock3, X, FileImage } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useRepayments } from '@/features/lending/lending.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type Kind = 'contribution' | 'repayment';
type Status = 'paid' | 'review' | 'rejected';
type Filter = 'all' | 'contribution' | 'repayment' | 'issue';
type ViewMode = 'grid' | 'list';

interface ProofItem {
  id: string;
  kind: Kind;
  label: string;
  amount: number;
  date: Date;
  status: Status;
  statusLabel: string;
  reference: string | null;
  proofUrl: string;
  verifiedBy: string | null;
}

const STATUS_TONE: Record<Status, { bg: string; fg: string; Icon: any }> = {
  paid: { bg: intent.success.base, fg: '#fff', Icon: Check },
  review: { bg: intent.info.base, fg: '#fff', Icon: Clock3 },
  rejected: { bg: intent.danger.base, fg: '#fff', Icon: AlertTriangle },
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}
function monthLabel(d: Date) {
  return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}
function shortDate(d: Date) {
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function Thumb({ path, style }: { path: string; style: any }) {
  const url = useSignedProofUrl(path);
  return (
    <View style={[{ backgroundColor: semantic.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <FileImage size={18} color={semantic.textMuted} />}
    </View>
  );
}

function GridTile({ item, onPress }: { item: ProofItem; onPress: () => void }) {
  const tone = STATUS_TONE[item.status];
  return (
    <Pressable onPress={onPress} style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 14, overflow: 'hidden' }}>
      <Thumb path={item.proofUrl} style={{ width: '100%', height: '100%' }} />
      <View style={{ position: 'absolute', top: 6, right: 6, width: 19, height: 19, borderRadius: 10, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
        <tone.Icon size={10} color={tone.fg} strokeWidth={3} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingTop: 16, paddingBottom: 7, backgroundColor: 'rgba(9,32,42,0.6)' }}>
        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(item.amount)}</Text>
        <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: '#C2D8E1', marginTop: 1 }}>{shortDate(item.date)}{item.kind === 'repayment' ? ' · loan' : ''}</Text>
      </View>
    </Pressable>
  );
}

function ListRow({ item, onPress }: { item: ProofItem; onPress: () => void }) {
  const tone = STATUS_TONE[item.status];
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
      <Thumb path={item.proofUrl} style={{ width: 46, height: 46, borderRadius: 12 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{item.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <Text variant="caption" color="secondary">
            {shortDate(item.date)}{item.reference ? ` · ref ${item.reference}` : ''}{item.verifiedBy ? ` · verified by ${item.verifiedBy}` : ''}
          </Text>
          <View style={{ backgroundColor: tone.bg, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{item.statusLabel}</Text>
          </View>
        </View>
      </View>
      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(item.amount)}</Text>
    </Pressable>
  );
}

function Lightbox({ item, onClose }: { item: ProofItem | null; onClose: () => void }) {
  const url = useSignedProofUrl(item?.proofUrl);
  if (!item) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(9,32,42,0.92)', justifyContent: 'center' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ marginHorizontal: 20 }}>
          <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: semantic.surfaceAlt, aspectRatio: 3 / 4 }}>
            {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : <ActivityIndicator color="#fff" style={{ flex: 1 }} />}
          </View>
          <View style={{ marginTop: 14, gap: 3 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{item.label} · {formatPeso(item.amount)}</Text>
            <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>
              {shortDate(item.date)}{item.reference ? ` · ref ${item.reference}` : ''}{item.verifiedBy ? ` · verified by ${item.verifiedBy}` : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: 50, right: 24, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function MyProofs() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group, membership } = useActiveGroup();
  const contribs = useContributions(groupId!, {});
  const repayments = useRepayments(groupId!);

  const [view, setView] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<ProofItem | null>(null);

  const loading = contribs.loading || repayments.loading;

  const items = useMemo<ProofItem[]>(() => {
    const contribItems: ProofItem[] = (contribs.data ?? [])
      .filter((c) => c.membership_id === membership?.id && c.proof_url)
      .map((c) => {
        const date = new Date(c.created_at);
        const status: Status = c.status === 'approved' ? 'paid' : c.status === 'rejected' ? 'rejected' : 'review';
        return {
          id: c.id,
          kind: 'contribution',
          label: `${date.toLocaleDateString('en-PH', { month: 'long' })} contribution`,
          amount: Number(c.amount),
          date,
          status,
          statusLabel: status === 'paid' ? 'Posted' : status === 'rejected' ? 'Resubmit' : 'Under review',
          reference: c.external_reference,
          proofUrl: c.proof_url!,
          verifiedBy: status === 'paid' ? (c.approver?.full_name ?? null) : null,
        };
      });

    // Loan repayments don't carry an ordinal of their own — number them per
    // loan, oldest first, so "Loan repayment 2" means the same thing here as
    // it does on the loan's own repayment history.
    const byLoan = new Map<string, typeof repayments.data>();
    for (const p of repayments.data ?? []) {
      if (!p.proof_url) continue;
      if (p.loans && p.loans.membership_id !== membership?.id) continue;
      const list = byLoan.get(p.loan_id) ?? [];
      list.push(p);
      byLoan.set(p.loan_id, list);
    }
    const repayItems: ProofItem[] = [];
    for (const list of byLoan.values()) {
      const sorted = [...(list ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      sorted.forEach((p, i) => {
        const date = new Date(p.created_at);
        const status: Status = (p.status === 'approved' || p.status === 'paid') ? 'paid' : p.status === 'rejected' ? 'rejected' : 'review';
        repayItems.push({
          id: p.id,
          kind: 'repayment',
          label: `Loan repayment ${i + 1}`,
          amount: Number(p.amount),
          date,
          status,
          statusLabel: status === 'paid' ? 'Posted' : status === 'rejected' ? 'Resubmit' : 'Under review',
          reference: p.external_reference,
          proofUrl: p.proof_url!,
          verifiedBy: status === 'paid' ? (p.verifier?.full_name ?? null) : null,
        });
      });
    }

    return [...contribItems, ...repayItems].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [contribs.data, repayments.data, membership?.id]);

  const rejectedCount = items.filter((i) => i.status === 'rejected').length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === 'contribution' && i.kind !== 'contribution') return false;
      if (filter === 'repayment' && i.kind !== 'repayment') return false;
      if (filter === 'issue' && i.status !== 'rejected') return false;
      if (!q) return true;
      return (
        i.label.toLowerCase().includes(q) ||
        monthLabel(i.date).toLowerCase().includes(q) ||
        String(i.amount).includes(q) ||
        (i.reference ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProofItem[]>();
    for (const it of filtered) {
      const key = monthKey(it.date);
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, list]) => ({ label: monthLabel(list[0].date), items: list }));
  }, [filtered]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'contribution', label: 'Contributions' },
    { key: 'repayment', label: 'Repayments' },
    { key: 'issue', label: 'Needs attention' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar
        title="My proofs"
        subtitle={`${items.length} receipt${items.length === 1 ? '' : 's'} · ${group?.name ?? 'Group'}`}
        right={
          <View style={{ flexDirection: 'row', gap: 3, backgroundColor: semantic.surfaceAlt, borderRadius: 11, padding: 3 }}>
            <Pressable onPress={() => setView('grid')} style={{ width: 30, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: view === 'grid' ? semantic.surface : 'transparent' }}>
              <LayoutGrid size={15} color={semantic.brandDark} />
            </Pressable>
            <Pressable onPress={() => setView('list')} style={{ width: 30, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: view === 'list' ? semantic.surface : 'transparent' }}>
              <List size={15} color={semantic.brandDark} />
            </Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }, CARD_SHADOW]}>
          <Search size={17} color={semantic.textMuted} />
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Search by month, amount or reference no."
            placeholderTextColor={semantic.textMuted}
            style={{ flex: 1, fontSize: 13.5, color: semantic.textPrimary, padding: 0 }}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 7 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 18, backgroundColor: active ? semantic.dashCard : semantic.surface, borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border }}
              >
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {rejectedCount > 0 ? (
          <Pressable onPress={() => setFilter('issue')} style={{ marginTop: 16, backgroundColor: intent.warning.soft, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
            <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(168,124,44,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>!</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>{rejectedCount} proof{rejectedCount === 1 ? ' was' : 's were'} returned</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>Open it from Contributions or Loans to see what to fix and upload a clearer one.</Text>
            </View>
          </Pressable>
        ) : null}

        {loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : filtered.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 16 }, CARD_SHADOW]}>
            <Text variant="body" color="muted">{query || filter !== 'all' ? 'No receipts match.' : 'No proof images uploaded yet.'}</Text>
          </View>
        ) : view === 'grid' ? (
          grouped.map((g) => (
            <View key={g.label}>
              <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>{g.label}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {g.items.map((it) => (
                  <View key={it.id} style={{ width: '31.5%' }}>
                    <GridTile item={it} onPress={() => setOpened(it)} />
                  </View>
                ))}
              </View>
            </View>
          ))
        ) : (
          <>
            <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>All receipts</Text>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
              {filtered.map((it) => <ListRow key={it.id} item={it} onPress={() => setOpened(it)} />)}
            </View>
          </>
        )}

        <Text variant="caption" color="secondary" style={{ marginTop: 18, lineHeight: 17, paddingHorizontal: 2 }}>
          Your receipts stay in the app for as long as you're in the group, and are kept with the cycle after it closes.
        </Text>
      </ScrollView>

      <Lightbox item={opened} onClose={() => setOpened(null)} />
    </SafeAreaView>
  );
}
