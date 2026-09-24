import { View, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Clock3 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { semantic, intent } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoans, useLoan } from '@/features/lending/lending.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { AmountBlock, Badge, BlockedState, CloseHeader, SectionHead } from '@/features/payments/PaymentPage';

/** The repayment that's waiting on an officer — same status screen as a contribution under review (contributions/contribute). */
function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ProofThumb({ path, title, sub }: { path: string | null; title: string; sub: string }) {
  const url = useSignedProofUrl(path);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

export default function RepaymentStatus() {
  const { groupId, from } = useLocalSearchParams<{ groupId: string; from?: string }>();
  const router = useRouter();
  const close = () => router.back();
  const { membership } = useActiveGroup();
  const loans = useLoans(groupId!, { status: 'active' });
  const loan = (loans.data ?? []).find((l) => l.membership_id === membership?.id) ?? null;
  const detail = useLoan(groupId!, loan?.id);
  const current = (detail.data?.payments ?? []).find((p) => p.status === 'submitted') ?? null;

  const loading = (loans.data === null && !loans.error) || (!!loan && detail.data === null && !detail.error);
  // Opened from the loan page itself, a "View my loan" button would just point back at it.
  const showViewLoan = from !== 'loans';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Loan repayment" onClose={close} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Loan repayment" onClose={close} />
        <BlockedState icon={Check} tone="success" title="Nothing under review" body="Your last repayment has been settled. You can make the next one from your loan." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title="Loan repayment" onClose={close} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <AmountBlock
          label="Submitted"
          amount={current.amount}
          badge={<Badge tone="info" label="Under review" Icon={Clock3} />}
          meta={<>Sent <Text style={{ fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{shortDate(current.created_at)}</Text>{current.external_reference ? ` · ref ${current.external_reference}` : ''}</>}
          note={loan?.purpose ?? undefined}
        />

        <SectionHead title="Progress" />
        <View style={{ gap: 4 }}>
          {[
            { done: true, now: false, title: 'You submitted your proof', sub: shortDate(current.created_at) },
            { done: false, now: true, title: 'An officer is reviewing', sub: 'Checked against the amount and reference number' },
            { done: false, now: false, title: 'Posted to the ledger', sub: 'Comes off what you still owe on your loan' },
          ].map((s, i, arr) => (
            <View key={s.title} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center', width: 24 }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: s.done ? intent.success.base : s.now ? intent.info.base : semantic.surfaceAlt,
                }}>
                  {s.done ? <Check size={11} color="#fff" strokeWidth={3} /> : (
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: s.now ? '#fff' : semantic.textMuted }}>{i + 1}</Text>
                  )}
                </View>
                {i < arr.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: s.done ? intent.success.base : semantic.border, marginTop: 2 }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: s.now ? intent.info.text : s.done ? semantic.textPrimary : semantic.textMuted }}>{s.title}</Text>
                <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 16 }}>{s.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <SectionHead title="What you sent" />
        {current.proof_url ? (
          <ProofThumb path={current.proof_url} title="Proof of payment" sub={`Uploaded ${shortDate(current.created_at)}`} />
        ) : (
          <Text variant="body" color="muted">No proof attached to this repayment.</Text>
        )}
      </ScrollView>

      {showViewLoan ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: semantic.background }}>
          <Button label="View my loan" variant="ghost" onPress={() => router.replace({ pathname: '/(app)/[groupId]/loans' as any, params: { groupId } })} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
