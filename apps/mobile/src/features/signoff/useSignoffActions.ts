/**
 * features/signoff/useSignoffActions.ts
 * ----------------------------------------------------------------------------
 * The step each sign-off item is waiting for (confirm, verify, review,
 * release, verify release), and sending it back — with the right endpoint,
 * a toast on success and an alert on failure.
 */
import { useState } from 'react';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { useConfirmContribution, useVerifyContribution, useRejectContribution } from '@/features/contributions/contributions.hooks';
import { useConfirmRepaymentReceipt, useVerifyRepayment, useRejectRepayment, useReviewLoan, useDisburseLoan, useVerifyLoanRelease } from '@/features/lending/lending.hooks';
import { useVerifyReversal, useRejectReversal } from '@/features/ledger/ledger.hooks';
import type { SignoffItem } from './signoff';

/** Button label for the step, as the detail page shows it. */
export const PRIMARY_LABEL: Record<SignoffItem['action'], string> = {
  confirm: 'Confirm receipt',
  verify: 'Approve and post',
  review: 'Clear for release',
  release: 'Release funds',
  verify_release: 'Verify and post',
};

// Money already out can't be sent back — it's flagged instead.
export const canSendBack = (i: SignoffItem) => i.action !== 'release' && i.action !== 'verify_release';
export const sendBackLabel = (i: SignoffItem) => (i.action === 'review' ? 'Send back' : 'Reject');

export function useSignoffActions(groupId: string, onDone: () => void) {
  const confirmContrib = useConfirmContribution(groupId);
  const verifyContrib = useVerifyContribution(groupId);
  const rejectContrib = useRejectContribution(groupId);
  const confirmRepayment = useConfirmRepaymentReceipt(groupId);
  const verifyRepayment = useVerifyRepayment(groupId);
  const rejectRepayment = useRejectRepayment(groupId);
  const verifyReversal = useVerifyReversal(groupId);
  const rejectReversal = useRejectReversal(groupId);
  const reviewLoan = useReviewLoan(groupId);
  const releaseLoan = useDisburseLoan(groupId);
  const verifyRelease = useVerifyLoanRelease(groupId);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, failTitle: string, err: () => { message: string } | null, done: string) {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok === undefined) {
      Alert.alert(failTitle, err()?.message ?? 'Try again.');
      return false;
    }
    toast(done);
    onDone();
    return true;
  }

  /** Take the step the item is waiting for. Resolves true on success. */
  function approve(i: SignoffItem): Promise<boolean> {
    const fail = `Could not ${PRIMARY_LABEL[i.action].toLowerCase()}`;
    if (i.kind === 'contribution') {
      return i.action === 'confirm'
        ? run(() => confirmContrib.run(i.id), fail, () => confirmContrib.error, 'Confirmed — waiting for verification')
        : run(() => verifyContrib.run(i.id), fail, () => verifyContrib.error, 'Verified and posted to the ledger');
    }
    if (i.kind === 'repayment') {
      return i.action === 'confirm'
        ? run(() => confirmRepayment.run(i.id), fail, () => confirmRepayment.error, 'Confirmed — waiting for verification')
        : run(() => verifyRepayment.run(i.id), fail, () => verifyRepayment.error, 'Verified and posted to the ledger');
    }
    if (i.kind === 'reversal') return run(() => verifyReversal.run(i.id), fail, () => verifyReversal.error, 'Reversal verified — the Organizer finalizes it');
    if (i.action === 'review') return run(() => reviewLoan.run(i.id, true), fail, () => reviewLoan.error, 'Cleared for release');
    if (i.action === 'release') return run(() => releaseLoan.run(i.id), fail, () => releaseLoan.error, 'Loan released — waiting for verification');
    return run(() => verifyRelease.run(i.id), fail, () => verifyRelease.error, 'Release verified and posted to the ledger');
  }

  /** Reject / send back, with the reason shown to the person. */
  function sendBack(i: SignoffItem, reason: string): Promise<boolean> {
    const r = reason || undefined;
    if (i.kind === 'contribution') return run(() => rejectContrib.run(i.id, r), 'Could not reject', () => rejectContrib.error, 'Rejected — the member has been told why');
    if (i.kind === 'repayment') return run(() => rejectRepayment.run(i.id, r), 'Could not reject', () => rejectRepayment.error, 'Rejected — the borrower has been told why');
    if (i.kind === 'reversal') return run(() => rejectReversal.run(i.id, r), 'Could not reject', () => rejectReversal.error, 'Reversal rejected — the entry stands');
    if (!reason) {
      Alert.alert('Add a reason', 'Say why the loan is going back to the approver.');
      return Promise.resolve(false);
    }
    return run(() => reviewLoan.run(i.id, false, reason), 'Could not send back', () => reviewLoan.error, 'Sent back to the approver');
  }

  return { approve, sendBack, busy };
}
