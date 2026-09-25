import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, X, Clock3, ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { semantic, intent } from '@/theme/colors';
import { DetailSection } from '@/features/activity/DetailCard';
import { formatPeso } from '@/lib/money';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import { describe, ROLE_LABEL } from '@/features/auditlog/describe';

const AREA: Record<string, string> = {
  membership_approval: 'Members', membership_role: 'Members', membership_heads: 'Members',
  loan_decision: 'Loans', loan_disbursement: 'Loans', loan_payment: 'Loans',
  contribution: 'Contributions', expense: 'Expenses', ledger_adjustment: 'Ledger', penalty: 'Penalties',
  reversal_request: 'Reversals', distribution: 'Year-end', cycle: 'Cycle', group_gcash: 'Payment channel',
  announcement: 'Announcements', payment_reminder: 'Reminders',
  loan: 'Loans', audit_finding: 'Audit findings',
};

// Only fields worth showing a person, in this order; anything else stored on the entry is internal.
const FIELDS: { key: string; label: string; fmt?: (v: any) => string }[] = [
  { key: 'amount', label: 'Amount', fmt: formatPeso },
  { key: 'principal', label: 'Loan amount', fmt: formatPeso },
  { key: 'approved_principal', label: 'Approved amount', fmt: formatPeso },
  { key: 'interest_rate', label: 'Interest', fmt: (v) => `${+(Number(v) * 100).toFixed(2)}% / month` },
  { key: 'total_amount', label: 'Total', fmt: formatPeso },
  { key: 'contribution_amount', label: 'Contribution per head', fmt: formatPeso },
  { key: 'heads', label: 'Heads' },
  { key: 'role', label: 'Role', fmt: (v) => ROLE_LABEL[v] ?? v },
  { key: 'name', label: 'Name' },
  { key: 'number', label: 'GCash number' },
  { key: 'direction', label: 'Direction', fmt: (v) => (v === 'credit' ? 'Money in' : 'Money out') },
];

function dateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
}

/** One audit-log entry, opened from the Organizer's activity feed or the Auditor's audit log; the header is the close icon alone. */
export function AuditEntryDetail() {
  const { groupId, id, at } = useLocalSearchParams<{ groupId: string; id: string; at?: string }>();
  const router = useRouter();
  const close = () => router.back();
  // No single-entry endpoint, so read the page that ends at this entry's timestamp and pick it out.
  const before = at ? new Date(new Date(at).getTime() + 1).toISOString() : undefined;
  const page = useAuditLog(groupId!, { before, limit: before ? 10 : 100 });
  const e = page.data?.find((x) => x.id === id) ?? null;

  if (!e) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        {page.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40 }}>This activity couldn’t be found.</Text>
        )}
      </SafeAreaView>
    );
  }

  const d = describe(e);
  const tone = d.toBad ? intent.danger : d.toGood ? intent.success : null;
  const Icon = d.toBad ? X : d.toGood ? Check : Clock3;
  const after = (e.after_data ?? {}) as Record<string, any>;
  const beforeData = (e.before_data ?? {}) as Record<string, any>;

  const details = FIELDS.filter((f) => after[f.key] != null && after[f.key] !== '').map((f) => {
    const fmt = f.fmt ?? String;
    const was = beforeData[f.key];
    const now = fmt(after[f.key]);
    return { k: f.label, v: was != null && was !== after[f.key] ? `${fmt(was)} → ${now}` : now };
  });

  const rows = [
    { k: 'Done by', v: e.actor?.full_name ?? 'Someone' },
    ...(e.actor_role ? [{ k: 'Role', v: ROLE_LABEL[e.actor_role] ?? e.actor_role }] : []),
    { k: 'Area', v: AREA[e.entity_type] ?? e.entity_type.replace(/_/g, ' ') },
    { k: 'When', v: dateTime(e.created_at) },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Summary */}
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: tone?.soft ?? semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={24} color={tone?.text ?? semantic.brandDark} strokeWidth={2.4} />
          </View>
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 12, textAlign: 'center' }}>{d.title}</Text>
          {d.from || d.to ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: semantic.surfaceAlt, borderRadius: 20 }}>
              {d.from ? <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: semantic.textMuted }}>{d.from}</Text> : null}
              {d.from && d.to ? <ArrowRight size={12} color={semantic.textMuted} /> : null}
              {d.to ? <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: tone?.text ?? semantic.textPrimary }}>{d.to}</Text> : null}
            </View>
          ) : null}
        </View>

        {d.reason ? (
          <View style={{ marginTop: 16, padding: 14, backgroundColor: intent.danger.soft, borderRadius: 14 }}>
            <Text variant="overline" style={{ color: intent.danger.text }}>Reason</Text>
            <Text variant="body" style={{ color: intent.danger.text, marginTop: 3 }}>{d.reason}</Text>
          </View>
        ) : null}

        <DetailSection title="Details" rows={details.map((r) => [r.k, r.v])} />
        <DetailSection title="Record" rows={rows.map((r) => [r.k, r.v])} />
      </ScrollView>
    </SafeAreaView>
  );
}
