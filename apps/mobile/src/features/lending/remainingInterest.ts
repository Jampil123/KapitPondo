import type { Loan, LoanPayment } from '@/api/lending';

type LoanForInterest = Pick<Loan, 'principal' | 'approved_principal' | 'interest_rate' | 'term_months'>;

/**
 * Flat-rate interest: loan amount × monthly rate, every month of the term
 * (₱1,000 at 3% over 2 months = ₱30 + ₱30). Same convention as the request
 * screen and expectedMonthlyDue — and confirm_loan_repayment (migration 0063).
 */
export function totalInterest(loan: LoanForInterest | null): number {
  if (!loan || !loan.interest_rate || !loan.term_months) return 0;
  const principal = Number(loan.approved_principal ?? loan.principal ?? 0);
  return Math.round(principal * Number(loan.interest_rate) * loan.term_months * 100) / 100;
}

/** Interest already posted by confirmed repayments. */
export function interestPaid(payments: Pick<LoanPayment, 'status' | 'interest_portion'>[]): number {
  return payments
    .filter((p) => p.status === 'paid' || p.status === 'approved')
    .reduce((s, p) => s + Number(p.interest_portion), 0);
}

/** Interest still to come on this loan. */
export function remainingInterest(loan: LoanForInterest | null, payments: Pick<LoanPayment, 'status' | 'interest_portion'>[]): number {
  return Math.max(0, totalInterest(loan) - interestPaid(payments));
}
