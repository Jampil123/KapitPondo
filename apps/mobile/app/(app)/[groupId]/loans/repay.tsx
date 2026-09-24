import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Coins, Repeat, Clock3 } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { semantic } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { buildContributionReference } from '@/lib/qrPh';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoans, useLoan, useRepayments, useSubmitRepayment } from '@/features/lending/lending.hooks';
import { remainingInterest } from '@/features/lending/remainingInterest';
import { useLoanProofScan, confirmLoanSubmitDespiteDuplicate } from '@/features/lending/useProofScan';
import { expectedMonthlyDue } from '@/features/lending/expectedMonthlyDue';
import {
  AmountBlock, Badge, BlockedState, CloseHeader, GcashDetails, PaymentForm, SuccessView, formatDateTime,
} from '@/features/payments/PaymentPage';

/** What the member just sent, captured at submit time so the success page doesn't depend on the refetched loan. */
type Receipt = {
  amount: string;
  reference: string;
  submittedAt: Date;
  loanLabel: string;
  recipient: string | null;
};

export default function Repay() {
  const { groupId, loanId } = useLocalSearchParams<{ groupId: string; loanId?: string }>();
  const router = useRouter();
  const { group, membership } = useActiveGroup();
  const loans = useLoans(groupId!, { status: 'active' });
  // listLoans only self-scopes server-side when role === 'member' — filter
  // here so an officer's own Member-tab submission only ever targets THEIR
  // own loan (the API rejects submitting for anyone else's anyway).
  // A member can have one loan per head — repay the one they opened (loanId),
  // else their first active one.
  const activeLoan = (loans.data ?? []).find((l) => l.membership_id === membership?.id && (!loanId || l.id === loanId)) ?? null;
  const submit = useSubmitRepayment(groupId!);
  // One at a time: a repayment still under review has to be settled before the next can be sent.
  const pending = useRepayments(groupId!, 'submitted');
  const underReview = !!activeLoan && (pending.data ?? []).some((p) => p.loan_id === activeLoan.id);

  const hasTreasurerGcash = !!group?.treasurer_gcash_number;
  const [amountEdit, setAmountEdit] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const outstanding = Number(activeLoan?.outstanding_balance ?? 0);
  // Needs the loan's own payments to know how much interest is still to come (flat rate, see remainingInterest).
  const detail = useLoan(groupId!, activeLoan?.id);
  const interestLeft = remainingInterest(activeLoan, detail.data?.payments ?? []);
  const suggestedAmount = expectedMonthlyDue(activeLoan, interestLeft);

  // The loan loads asynchronously, so show its expected payment until the user types their own amount.
  const amount = amountEdit ?? (suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '');

  const { scanning, flags, scanMeta, scanProof, reset: resetScan } = useLoanProofScan({
    groupId,
    // Compare the receipt against what's typed right now, so paying a different amount than suggested doesn't raise a false mismatch.
    expectedAmount: Number(toAmountString(amount)) || suggestedAmount,
    treasurerGcashNumber: group?.treasurer_gcash_number,
    // Only the reference is filled from the scan: a misread receipt once silently replaced a correct ₱530 with ₱1000.
    onFields: (fields) => {
      if (fields.reference) setReference(fields.reference);
    },
  });

  const qrReference = useMemo(
    () => (group && membership ? buildContributionReference({ fundCode: group.fund_code, membershipId: membership.id }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group?.fund_code, membership?.id],
  );

  async function copyValue(key: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 1500);
  }

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const uri = res.assets[0].uri;
    setProofUri(uri);
    setReference('');
    resetScan();
    scanProof(uri);
  }

  async function onSubmit() {
    if (!activeLoan) return;
    const amt = toAmountString(amount);
    if (!amt || Number(amt) <= 0) return Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
    if (!proofUri) return Alert.alert('Proof required', 'Attach a photo or screenshot of your payment before submitting.');

    if (groupId) {
      const proceed = await confirmLoanSubmitDespiteDuplicate(groupId, reference, !!flags);
      if (!proceed) return;
    }

    setUploading(true);
    try {
      const proof_url = await uploadImage('proofs', proofUri, 'repayment');
      const ok = await submit.run(activeLoan.id, { amount: amt, external_reference: reference || undefined, proof_url });
      if (ok !== undefined) {
        setReceipt({
          amount: amt,
          reference: reference.trim(),
          submittedAt: new Date(),
          loanLabel: activeLoan.purpose ?? 'Loan',
          recipient: hasTreasurerGcash ? [group?.treasurer_gcash_name, group?.treasurer_gcash_number].filter(Boolean).join(' · ') || null : null,
        });
      } else if (submit.error) {
        Alert.alert('Could not submit', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const close = () => router.back();

  if (receipt) {
    return (
      <SuccessView
        heading="Repayment submitted"
        amount={receipt.amount}
        note="An officer will confirm it. You'll be notified once it's posted."
        rows={[
          { label: 'Status', value: <Badge tone="info" label="Under review" Icon={Clock3} /> },
          { label: 'Loan', value: receipt.loanLabel },
          ...(receipt.recipient ? [{ label: 'Sent to', value: receipt.recipient }] : []),
          ...(receipt.reference ? [{ label: 'Reference', value: receipt.reference }] : []),
          { label: 'Submitted', value: formatDateTime(receipt.submittedAt) },
        ]}
        onClose={close}
        viewAllLabel="View my loan"
        onViewAll={() => router.replace({ pathname: '/(app)/[groupId]/loans', params: { groupId } })}
      />
    );
  }

  // Data is kept across refetches, so this only holds the very first paint — otherwise the page flashes "no active loan".
  if (loans.data === null && !loans.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader onClose={close} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={semantic.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!activeLoan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <CloseHeader title="Repay loan" onClose={close} />
        <BlockedState icon={Coins} tone="info" title="No active loan" body="You don't have an active loan to repay right now." />
      </SafeAreaView>
    );
  }

  if (underReview && !receipt) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
        <CloseHeader title="Repay loan" onClose={close} />
        <BlockedState icon={Clock3} tone="info" title="A repayment is under review" body="You can send the next one once an officer confirms or returns it." />
        <View style={{ padding: 16 }}>
          <Button label="View my repayments" onPress={() => router.replace({ pathname: '/(app)/[groupId]/loans/repayments' as any, params: { groupId } })} />
        </View>
      </SafeAreaView>
    );
  }

  const busy = submit.loading || uploading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title="Repay loan" onClose={close} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <AmountBlock
            label={suggestedAmount >= outstanding + interestLeft ? 'Amount due' : "This month's payment"}
            amount={suggestedAmount}
            badge={<Badge tone="primary" label="Active loan" Icon={Repeat} />}
            meta={`${activeLoan.purpose ?? 'Loan'} · ${activeLoan.term_months} month${activeLoan.term_months === 1 ? '' : 's'}`}
            note={`${formatPeso(outstanding + interestLeft)} left to repay`}
            copied={copiedField === 'amount'}
            onCopy={() => copyValue('amount', suggestedAmount.toFixed(2))}
          />

          {hasTreasurerGcash ? (
            <GcashDetails
              qrPath={group?.treasurer_gcash_qr_url}
              recipientName={group?.treasurer_gcash_name || 'Treasurer GCash'}
              number={group?.treasurer_gcash_number ?? ''}
              reference={qrReference}
              copiedField={copiedField}
              onCopy={copyValue}
            />
          ) : null}

          <PaymentForm
            amount={amount} setAmount={setAmountEdit}
            reference={reference} setReference={setReference}
            proofUri={proofUri} pickProof={pickProof} scanning={scanning}
            flags={flags} scanMeta={scanMeta} dueAmountLabel={formatPeso(suggestedAmount)}
          />
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: semantic.background }}>
          <Button label="Submit repayment" onPress={onSubmit} loading={busy} disabled={!proofUri} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
