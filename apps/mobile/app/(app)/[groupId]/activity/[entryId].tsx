import { View, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDownRight, ArrowUpRight, Receipt } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { parseApiDate } from '@/lib/cycle';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useLedger } from '@/features/reporting/reporting.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useLoans, useRepayments } from '@/features/lending/lending.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { ENTRY_LABEL, PAYMENT_METHOD_LABEL } from '@/features/activity/entryCopy';
import { DetailSection, DetailTitle, StatusPill } from '@/features/activity/DetailCard';
import { BlockedState, CloseHeader, formatDateTime } from '@/features/payments/PaymentPage';
import type { LedgerEntry } from '@/api/ledger';

function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = parseApiDate(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProofPreview({ path }: { path: string | null | undefined }) {
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

function ContributionExtras({ entry }: { entry: LedgerEntry }) {
  const contributions = useContributions(entry.group_id, {});
  const c = contributions.data?.find((x) => x.id === entry.source_id);
  if (!c) return null;
  return (
    <>
      <DetailSection
        title="Payment details"
        rows={[
          ['For period', c.due_date ? `Due ${shortDate(c.due_date)}` : null],
          ['Paid via', c.payment_method ? PAYMENT_METHOD_LABEL[c.payment_method] : null],
          ['Reference', c.external_reference],
        ]}
      />
      <ProofPreview path={c.proof_url} />
    </>
  );
}

function RepaymentExtras({ entry }: { entry: LedgerEntry }) {
  const repayments = useRepayments(entry.group_id);
  const p = repayments.data?.find((x) => x.id === entry.source_id);
  if (!p) return null;
  return (
    <>
      <DetailSection
        title="Payment details"
        rows={[
          ['Principal', formatPeso(p.principal_portion)],
          ['Interest', formatPeso(p.interest_portion)],
          ['Paid via', p.payment_method ? PAYMENT_METHOD_LABEL[p.payment_method] : null],
          ['Reference', p.external_reference],
        ]}
      />
      <ProofPreview path={p.proof_url} />
    </>
  );
}

function LoanExtras({ entry }: { entry: LedgerEntry }) {
  const loans = useLoans(entry.group_id);
  const l = loans.data?.find((x) => x.id === entry.source_id);
  if (!l) return null;
  return (
    <DetailSection
      title="Loan details"
      rows={[
        ['Purpose', l.purpose],
        ['Amount', formatPeso(l.approved_principal ?? l.principal)],
        ['Term', `${l.term_months} month${l.term_months === 1 ? '' : 's'}`],
        ['Interest', l.interest_rate ? `${(Number(l.interest_rate) * 100).toFixed(1)}% / month` : null],
      ]}
    />
  );
}

/** Extras come from the record the entry was posted for, so they only mount (and fetch) for the entry types that have one. */
function EntryExtras({ entry }: { entry: LedgerEntry }) {
  if (entry.entry_type === 'contribution') return <ContributionExtras entry={entry} />;
  if (entry.entry_type === 'loan_repayment') return <RepaymentExtras entry={entry} />;
  if (entry.entry_type === 'loan_disbursement') return <LoanExtras entry={entry} />;
  return null;
}

export default function ActivityDetail() {
  const { groupId, entryId, scope } = useLocalSearchParams<{ groupId: string; entryId: string; scope?: 'group' }>();
  const router = useRouter();
  const { membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  // Same query as the Activity list, so members only ever see their own entries here. Officers opening a
  // group-wide transaction (Transactions page, dashboard) pass scope=group — the server only returns the whole
  // group's ledger to officer roles.
  const ledger = useLedger(groupId!, scope === 'group' ? { limit: 500 } : { membership_id: membership?.id });
  const entry = (ledger.data ?? []).find((e) => e.id === entryId) ?? null;
  const close = () => router.back();

  // Data is kept across refetches, so this only holds the very first paint.
  if (ledger.data === null && !ledger.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        <BlockedState icon={Receipt} tone="info" title="Activity not found" body="This entry isn't available any more." />
      </SafeAreaView>
    );
  }

  const credit = entry.direction === 'credit';
  const Icon = credit ? ArrowDownRight : ArrowUpRight;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={24} color={credit ? intent.success.text : semantic.brandDark} />
          </View>
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 12 }}>{ENTRY_LABEL[entry.entry_type]}</Text>
          <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5, marginTop: 2, color: credit ? intent.success.text : semantic.textPrimary }}>
            {credit ? '+' : '-'}{formatPeso(entry.amount)}
          </Text>
          <StatusPill label="Posted" bg={intent.success.soft} fg={intent.success.text} />
        </View>

        <DetailSection
          title="Record"
          rows={[
            ['Member', scope === 'group' ? entry.membership?.members?.full_name ?? 'Group' : null],
            ['Posted', formatDateTime(new Date(entry.posted_at))],
            ['Confirmed by', entry.poster?.full_name],
            ['Cycle', cycle && entry.cycle_id === cycle.id ? cycle.name : null],
            ['Note', entry.description],
            ['Ledger entry', `#${entry.id.slice(0, 8).toUpperCase()}`],
          ]}
        />

        <EntryExtras entry={entry} />
      </ScrollView>

    </SafeAreaView>
  );
}
