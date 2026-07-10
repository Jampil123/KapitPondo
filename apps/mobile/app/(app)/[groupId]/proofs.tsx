/**
 * app/(app)/[groupId]/proofs.tsx — My Proofs (member).
 * Every proof image the member has uploaded — contributions + repayments on
 * their current active loan (past loans' payment proofs aren't included:
 * that would need fetching every past loan's payments individually, an N+1
 * pattern not worth the round trips for a gallery screen).
 */
import { View, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useLoans, useLoan } from '@/features/lending/lending.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';

function ProofTile({ path, amount, date }: { path: string; amount: string; date: string | null }) {
  const url = useSignedProofUrl(path);
  return (
    <View style={{ width: '48%', gap: 6 }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: 110, borderRadius: 12 }} resizeMode="cover" />
      ) : (
        <View style={{ width: '100%', height: 110, borderRadius: 12, backgroundColor: semantic.surfaceAlt }} />
      )}
      <Text variant="caption" style={{ fontWeight: '600' }}>{amount}</Text>
      {date ? <Text variant="caption" color="muted">{date}</Text> : null}
    </View>
  );
}

function shortDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function MyProofs() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { membership } = useActiveGroup();
  const contribs = useContributions(groupId!, {});
  const activeLoans = useLoans(groupId!, { status: 'active' });
  // Both lists only self-scope server-side for role === 'member' — filter to our
  // own membership so an officer's "My Proofs" doesn't mix in other members'.
  const myLoans = (activeLoans.data ?? []).filter((l) => l.membership_id === membership?.id);
  const activeLoan = myLoans[0] ?? null;
  const loanDetail = useLoan(groupId!, activeLoan?.id);

  const contribProofs = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id && c.proof_url);
  const paymentProofs = (loanDetail.data?.payments ?? []).filter((p) => p.proof_url);
  const loading = contribs.loading || activeLoans.loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="My Proofs" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : contribProofs.length === 0 && paymentProofs.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
            <Text variant="body" color="muted">No proof images uploaded yet.</Text>
          </View>
        ) : (
          <>
            {contribProofs.length > 0 && (
              <>
                <Text variant="h3" style={{ fontSize: 15 }}>Contributions</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {contribProofs.map((c) => (
                    <ProofTile key={c.id} path={c.proof_url!} amount={formatPeso(c.amount)} date={shortDate(c.created_at)} />
                  ))}
                </View>
              </>
            )}
            {paymentProofs.length > 0 && (
              <>
                <Text variant="h3" style={{ fontSize: 15 }}>Repayments (active loan)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {paymentProofs.map((p) => (
                    <ProofTile key={p.id} path={p.proof_url!} amount={formatPeso(p.amount)} date={shortDate(p.paid_date)} />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
