import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useFlag } from '@/features/flags/flags.hooks';
import { FlagStatusPill, statusLine } from '@/features/flags/flagStatus';
import { AuditTimeline } from '@/features/auditlog/AuditTimeline';
import type { AuditFlag } from '@/api/flags';

const CHANNEL: Record<string, string> = { paymongo: 'PayMongo', gcash: 'GCash', cash: 'Cash', bank_transfer: 'Bank transfer', other: 'Other' };

// The record's own state, in the words the rest of the app uses.
const RECORD_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  approved: { label: 'Verified', tone: 'success' },
  paid: { label: 'Verified', tone: 'success' },
  submitted: { label: 'Pending', tone: 'warning' },
  pending: { label: 'Pending', tone: 'warning' },
  rejected: { label: 'Returned', tone: 'danger' },
  active: { label: 'Active', tone: 'success' },
  defaulted: { label: 'Defaulted', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function longDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 }, shadowToken.soft]}>{children}</View>;
}

function Section({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 9 }}>
      <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {right}
    </View>
  );
}

function recordRows(f: AuditFlag): [string, string | null][] {
  const r = f.record;
  const isLoan = f.entity_type === 'loan' || f.entity_type === 'loan_disbursement';
  return [
    [isLoan ? 'Date' : 'Date posted', longDate(r.posted_at)],
    ['Channel', r.channel ? CHANNEL[r.channel] ?? r.channel : null],
    ['Reference no.', r.reference],
    [isLoan ? 'Approved by' : 'Recorded by', r.recorded_by],
    [isLoan ? 'Released by' : 'Verified by', r.verified_by],
  ];
}

export default function FlagDetail() {
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id: string }>();
  const router = useRouter();
  const q = useFlag(groupId!, id!);
  const close = () => router.back();
  const f = q.data?.flag;

  if (!f) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        {q.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40 }}>This flag couldn’t be found.</Text>
        )}
      </SafeAreaView>
    );
  }

  const r = f.record;
  const recStatus = r.status ? RECORD_STATUS[r.status] : null;
  const rows = recordRows(f).filter(([, v]) => !!v) as [string, string][];
  const history = q.data?.history ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title={f.ref} onClose={close} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {/* The flagged record */}
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>
          {r.name ? `${r.kind}, ${r.name}` : r.kind}
        </Text>
        {r.amount !== null ? (
          <Text style={{ fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>{formatPeso(r.amount)}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {recStatus ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent[recStatus.tone].soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: intent[recStatus.tone].text }} />
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: intent[recStatus.tone].text }}>{recStatus.label}</Text>
            </View>
          ) : null}
          <FlagStatusPill status={f.status} prefix={`flag ${f.ref}`} />
        </View>

        {rows.length ? (
          <View style={{ marginTop: 16 }}>
            <Card>
              {rows.map(([label, value], i) => (
                <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                  <Text style={{ fontSize: 13, color: semantic.textSecondary }}>{label}</Text>
                  <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{value}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {/* The flag */}
        <Section title={`Flag ${f.ref}`} right={<FlagStatusPill status={f.status} />} />
        <Card>
          <View style={{ paddingVertical: 12, gap: 4 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{f.reason}</Text>
            {f.note && f.status !== 'open' ? <Text style={{ fontSize: 12.5, lineHeight: 18, color: semantic.textSecondary }}>{f.note}</Text> : null}
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: f.status === 'open' ? semantic.textSecondary : intent.success.text, marginTop: 2 }}>{statusLine(f)}</Text>
          </View>
        </Card>

        {/* Everything the audit trail holds on this record */}
        <Section title="Entry history" />
        <Card>
          <View style={{ paddingVertical: 12 }}>
            {history.length ? <AuditTimeline entries={history} /> : <Text variant="body" color="muted">No history yet.</Text>}
          </View>
        </Card>

        <Text style={{ fontSize: 11.5, lineHeight: 17, color: semantic.textSecondary, marginTop: 14, paddingHorizontal: 4 }}>
          Entries can’t be edited or deleted. Mistakes are fixed with a reversing entry started by the Treasurer, verified by you, and approved by the Organizer.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
