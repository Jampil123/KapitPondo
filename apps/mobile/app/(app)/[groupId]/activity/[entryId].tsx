import type { ReactNode } from 'react';
import { View, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDownRight, ArrowUpRight, Check, Receipt } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { parseApiDate } from '@/lib/cycle';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useLedger } from '@/features/reporting/reporting.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useLoans, useRepayments } from '@/features/lending/lending.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { ACTION_COPY, ENTRY_LABEL, PAYMENT_METHOD_LABEL } from '@/features/activity/entryCopy';
import { Badge, BlockedState, CloseHeader, SectionHead, SummaryRow, formatDateTime } from '@/features/payments/PaymentPage';
import type { LedgerEntry } from '@/api/ledger';

function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = parseApiDate(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A titled group of label/value rows; rows with no value are left out, and the group disappears if none are left. */
function DetailRows({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (shown.length === 0) return null;
  return (
    <>
      <SectionHead title={title} />
      {shown.map(([label, value], i) => <SummaryRow key={label} label={label} value={value} last={i === shown.length - 1} />)}
    </>
  );
}

function ProofPreview({ path }: { path: string | null | undefined }) {
  const url = useSignedProofUrl(path);
  if (!path) return null;
  return (
    <>
      <SectionHead title="Proof of payment" />
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: semantic.surfaceAlt }} resizeMode="cover" />
      ) : (
        <View style={{ height: 200, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
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
      <DetailRows
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
      <DetailRows
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
    <DetailRows
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
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  const router = useRouter();
  const { membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  // Same query as the Activity list, so members only ever see their own entries here.
  const ledger = useLedger(groupId!, { membership_id: membership?.id });
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
  const isLoan = entry.entry_type === 'loan_disbursement' || entry.entry_type === 'loan_repayment';
  const target = entry.entry_type === 'contribution'
    ? { label: 'View my contributions', route: 'contributions' }
    : isLoan ? { label: 'View my loan', route: 'loans' } : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader onClose={close} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', paddingTop: 20 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={28} color={credit ? intent.success.text : semantic.brandDark} />
          </View>
          <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 14 }}>{ENTRY_LABEL[entry.entry_type]}</Text>
          <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', letterSpacing: -0.6, marginTop: 4, color: credit ? intent.success.text : semantic.textPrimary }}>
            {credit ? '+' : '-'}{formatPeso(entry.amount)}
          </Text>
          <Text variant="body" color="secondary" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>
            {ACTION_COPY[entry.entry_type] ?? ENTRY_LABEL[entry.entry_type]}
          </Text>
        </View>

        <View style={{ marginTop: 26 }}>
          <SummaryRow label="Status" value={<Badge tone="success" label="Posted" Icon={Check} />} />
          <SummaryRow label="Posted" value={formatDateTime(new Date(entry.posted_at))} />
          {entry.poster ? <SummaryRow label="Confirmed by" value={entry.poster.full_name} /> : null}
          {cycle && entry.cycle_id === cycle.id ? <SummaryRow label="Cycle" value={cycle.name} /> : null}
          {entry.description ? <SummaryRow label="Note" value={entry.description} /> : null}
          <SummaryRow label="Ledger entry" value={`#${entry.id.slice(0, 8).toUpperCase()}`} last />
        </View>

        <EntryExtras entry={entry} />
      </ScrollView>

      {target ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 }}>
          <Button
            label={target.label}
            variant="ghost"
            onPress={() => router.replace({ pathname: `/(app)/[groupId]/${target.route}` as any, params: { groupId } })}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
