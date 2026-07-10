/**
 * app/(app)/[groupId]/contributions/index.tsx — Contributions overview (member).
 * Ledger-first: full history + who confirmed each entry, not just a submit form.
 * "Confirmed by {officer}" uses the approver join added in contributions.service.js;
 * there's no approved_at column in the schema, so we show the paid_date (date-only)
 * rather than inventing a precise timestamp.
 */
import { useMemo } from 'react';
import { View, ScrollView, Image, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Users, TrendingUp } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import type { Contribution } from '@/api/contributions';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

function shortDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ContributionRow({ c }: { c: Contribution }) {
  const confirmedDate = shortDate(c.paid_date);
  const proofUrl = useSignedProofUrl(c.proof_url);
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, gap: 10 }, shadowToken.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(c.amount)}</Text>
          <Text variant="caption" color="secondary">{shortDate(c.created_at) ?? '—'}</Text>
        </View>
        <StatusBadge entity="contribution" value={c.status} />
      </View>

      {proofUrl ? (
        <Image source={{ uri: proofUrl }} style={{ width: '100%', height: 120, borderRadius: 10 }} resizeMode="cover" />
      ) : null}

      {c.status === 'approved' ? (
        <Text variant="caption" color="secondary">
          Confirmed by {c.approver?.full_name ?? 'an officer'}{confirmedDate ? ` · ${confirmedDate}` : ''}
        </Text>
      ) : c.status === 'rejected' ? (
        <Text variant="caption" style={{ color: '#C25C5E' }}>Rejected</Text>
      ) : (
        <Text variant="caption" color="muted">Awaiting confirmation</Text>
      )}
    </View>
  );
}

export default function ContributionsOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { membership, role } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const contribs = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});

  const heads = membership?.heads ?? 1;
  // listContributions only self-scopes server-side when role === 'member' — for
  // owner/treasurer/auditor it returns the whole group's rows, so filter here to
  // guarantee this page only ever shows the caller's own contributions.
  const rows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);
  const paid = useMemo(
    () => rows.filter((c) => c.status === 'approved').reduce((sum, c) => sum + Number(c.amount), 0),
    [rows],
  );
  const perHead = Number(cycle?.contribution_amount ?? 0);
  const expected = perHead * heads;
  const pct = expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : 0;
  const advance = Math.max(0, paid - expected);

  function goToContribute() {
    router.push({ pathname: '/(app)/[groupId]/contributions/contribute', params: { groupId } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Contributions" subtitle={ROLE_LABEL[role ?? 'member'] ?? 'Member'} />
      <View style={{ padding: 16, gap: 14, flex: 1 }}>
        <View style={[{ backgroundColor: semantic.brand, borderRadius: 18, padding: 16, gap: 10 }]}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Paid this cycle</Text>
          <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(paid)}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" style={{ color: '#fff', opacity: 0.9 }}>of {formatPeso(expected)} expected</Text>
            <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>{pct}%</Text>
          </View>
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 8 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Users size={16} color={semantic.brandDark} style={{ marginTop: 1 }} />
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>
              Your contribution is based on your heads: {heads} head{heads === 1 ? '' : 's'} × {formatPeso(perHead)} = {formatPeso(expected)} this cycle.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <TrendingUp size={16} color={semantic.brandDark} style={{ marginTop: 1 }} />
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>
              {advance > 0
                ? `You've paid ${formatPeso(advance)} ahead of what's expected this cycle.`
                : "You can pay ahead of schedule — any extra counts toward future cycles."}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h3" style={{ fontSize: 15 }}>History</Text>
          <Pressable
            onPress={goToContribute}
            style={[{ width: 34, height: 34, borderRadius: 17, backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center' }, shadowToken.button]}
          >
            <Plus size={19} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </View>
        {contribs.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
            <Text variant="body" color="muted">No contributions yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
            {rows.map((c) => <ContributionRow key={c.id} c={c} />)}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
