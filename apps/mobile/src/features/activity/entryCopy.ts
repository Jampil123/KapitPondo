import type { LedgerEntryType } from '@/api/ledger';
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
};

export const ACTION_COPY: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Your contribution was approved',
  loan_disbursement: 'Your loan was approved & disbursed',
  loan_repayment: 'Your repayment was recorded',
  penalty: 'A penalty was applied',
  distribution: 'Your year-end share was paid out',
  expense: 'A group expense was posted',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  paymongo: 'Online payment',
  gcash: 'GCash',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};
