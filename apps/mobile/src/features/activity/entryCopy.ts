import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';
import type { PaymentMethod } from '@/api/contributions';

export const ENTRY_LABEL: Record<LedgerEntryType, string> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan released',
  loan_repayment: 'Loan repayment',
  distribution: 'Year-end share',
  expense: 'Group expense',
  penalty: 'Penalty',
  fee: 'Fee',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
  withdrawal: 'Withdrawal payout',
};

export const ACTION_COPY: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Your contribution was approved',
  loan_disbursement: 'Your loan was approved & disbursed',
  loan_repayment: 'Your repayment was recorded',
  penalty: 'A penalty was applied',
  distribution: 'Your year-end share was paid out',
  expense: 'A group expense was posted',
};

/** The two sign-offs on an entry: the first step (confirmed receipt, or released a loan) and the verifier who posted it. */
export function signoffs(e: Pick<LedgerEntry, 'entry_type' | 'confirmer' | 'poster'>) {
  return {
    confirmLabel: e.entry_type === 'loan_disbursement' || e.entry_type === 'withdrawal' ? 'Released by' : 'Confirmed by',
    confirmedBy: e.confirmer?.full_name ?? null,
    verifiedBy: e.poster?.full_name ?? null,
  };
}

/** "Confirmed by Ana · Verified by Ben" — either half dropped when it doesn't apply. */
export function signoffLine(e: Pick<LedgerEntry, 'entry_type' | 'confirmer' | 'poster'>): string {
  const s = signoffs(e);
  return [
    s.confirmedBy ? `${s.confirmLabel} ${s.confirmedBy}` : null,
    s.verifiedBy ? `Verified by ${s.verifiedBy}` : null,
  ].filter(Boolean).join(' · ');
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  gcash: 'GCash',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};
