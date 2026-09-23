import type { Loan } from '@/api/lending';

type LoanForDue = Pick<Loan, 'principal' | 'approved_principal' | 'interest_rate' | 'term_months' | 'outstanding_balance'>;

// Flat-rate convention shared by the loan overview, request and repay screens: principal / term + principal × rate.
// Capped at what is still owed — the principal left plus the interest still to come (see remainingInterest).
export function expectedMonthlyDue(loan: LoanForDue | null, interestLeft = 0): number {
  if (!loan) return 0;
  const principal = Number(loan.approved_principal ?? loan.principal ?? 0);
  const outstanding = Number(loan.outstanding_balance ?? 0);
  const monthly = loan.term_months && loan.interest_rate
    ? principal / loan.term_months + principal * Number(loan.interest_rate)
    : outstanding;
  return Math.min(monthly, outstanding + interestLeft);
}
