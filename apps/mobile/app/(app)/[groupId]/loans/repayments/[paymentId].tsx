import { View, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Repeat } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { formatPeso } from '@/lib/money';
import { useRepayments } from '@/features/lending/lending.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { PAYMENT_METHOD_LABEL } from '@/features/activity/entryCopy';
import { DetailSection, DetailTitle, StatusPill } from '@/features/activity/DetailCard';
import { CloseHeader, formatDateTime } from '@/features/payments/PaymentPage';

function shortDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Proof({ path }: { path: string | null }) {
  const url = useSignedProofUrl(path);
  if (!path) return null;
  return (
    <>
      <DetailTitle title="Proof of payment" />
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: 200, borderRadius: 18, backgroundColor: semantic.surfaceAlt }} resizeMode="cover" />
      ) : (
        <View style={{ height: 200, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      )}
    </>
  );
}

export default function RepaymentDetail() {
  const { groupId, paymentId } = useLocalSearchParams<{ groupId: string; paymentId: string }>();
  const router = useRouter();
  const close = () => router.back();
  const repayments = useRepayments(groupId!);
  const p = repayments.data?.find((x) => x.id === paymentId) ?? null;

  if (!p) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        {repayments.loading || !repayments.data ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40 }}>This repayment couldn’t be found.</Text>
        )}
      </SafeAreaView>
    );
  }

  const status = getStatusMeta('loanPayment', p.status);
  const tone = intent[status.intent];
  const posted = p.status === 'paid' || p.status === 'approved';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Repeat size={24} color={tone.text} />
          </View>
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 12 }}>Loan repayment</Text>
          <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5, marginTop: 2, color: semantic.textPrimary }}>{formatPeso(p.amount)}</Text>
          <StatusPill label={status.label} bg={tone.soft} fg={tone.text} />
        </View>

        {p.status === 'rejected' && p.rejection_reason ? (
          <View style={{ marginTop: 16, padding: 14, backgroundColor: intent.danger.soft, borderRadius: 14 }}>
            <Text variant="overline" style={{ color: intent.danger.text }}>Returned because</Text>
            <Text variant="body" style={{ color: intent.danger.text, marginTop: 3 }}>{p.rejection_reason}</Text>
          </View>
        ) : null}

        <DetailSection
          title="Payment details"
          rows={[
            ['Principal', posted ? formatPeso(p.principal_portion) : null],
            ['Interest', posted ? formatPeso(p.interest_portion) : null],
            ['Method', p.payment_method ? PAYMENT_METHOD_LABEL[p.payment_method] : null],
            ['Reference no.', p.external_reference],
          ]}
        />

        <DetailSection
          title="Record"
          rows={[
            ['Sent', formatDateTime(new Date(p.created_at))],
            ['Recorded by', p.auto_confirmed ? `Paid via ${p.gateway_provider ?? 'payment gateway'}` : p.recorder?.full_name],
            ['Confirmed by', p.verifier?.full_name],
            ['Posted', posted ? shortDate(p.paid_date) : null],
            ['Returned', p.status === 'rejected' ? shortDate(p.updated_at) : null],
          ]}
        />

        <Proof path={p.proof_url} />
      </ScrollView>
    </SafeAreaView>
  );
}
