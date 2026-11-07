import type { Loan, LoanPayment } from '@/api/lending';

/**
 * Month-by-month repayment schedule for a released loan, derived on the
 * client (there's no schedule table): installment k (1..term) falls due k
 * months after release, for the flat-rate monthly amount
 * (principal / term + principal × rate — same convention as expectedMonthlyDue).
 *
 * Payments are free amounts, applied penalty first, then to installments in
 * order, oldest first — the same positional idea as contributions. A month
 * that wasn't paid stays unpaid (late) until money actually covers it; paying
 * more than one installment's worth covers the next months in advance.
 *
 * Late penalty (migration 0077): an installment still unpaid past its due date
 * is charged loan.late_penalty_pct % of the installment once for every monthly
 * anniversary of its due date that passes before it's covered — so it grows
 * the longer it stays unpaid. Mirrors loan_penalty_accrued() in SQL, which is
 * what verify_repayment() actually charges.
 */
export type InstallmentKind = 'paid' | 'review' | 'late' | 'due' | 'upcoming';

export interface Installment {
  no: number;          // 1-based
  dueDate: Date;
  monthKey: number;    // year * 12 + month — for matching a calendar month
  amount: number;
  /** Late penalty accrued on this installment so far (0 if on time or no rate). */
  penalty: number;
  /** How many months late it is (or was, when it got covered). */
  monthsLate: number;
  kind: InstallmentKind;
}

type LoanForSchedule = Pick<Loan, 'id' | 'principal' | 'approved_principal' | 'interest_rate' | 'term_months' | 'disbursed_at' | 'status'> & {
  late_penalty_pct?: Loan['late_penalty_pct'];
};

const POSTED: LoanPayment['status'][] = ['paid', 'approved'];
const IN_REVIEW: LoanPayment['status'][] = ['submitted', 'confirmed'];
const EPS = 0.01;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const monthKeyOf = (d: Date) => d.getFullYear() * 12 + d.getMonth();
export const dateOfMonthKey = (k: number) => new Date(Math.floor(k / 12), k % 12, 1);
const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function addMonths(start: Date, n: number): Date {
  const daysInTarget = new Date(start.getFullYear(), start.getMonth() + n + 1, 0).getDate();
  return new Date(start.getFullYear(), start.getMonth() + n, Math.min(start.getDate(), daysInTarget));
}

/** Monthly anniversaries of `due` (due itself included) strictly before `end`. */
function monthsLateBetween(due: Date, end: Date): number {
  let n = 0;
  while (n < 240 && addMonths(due, n) < end) n++;
  return n;
}

export function monthlyInstallment(loan: Pick<Loan, 'principal' | 'approved_principal' | 'interest_rate' | 'term_months'>): number {
  const principal = Number(loan.approved_principal ?? loan.principal ?? 0);
  if (!loan.term_months) return principal;
  return r2(principal / loan.term_months + principal * Number(loan.interest_rate ?? 0));
}

/** One penalty charge for one late month: rate % of the installment. */
export function penaltyPerMonth(loan: LoanForSchedule): number {
  const pct = Number(loan.late_penalty_pct ?? 0);
  return pct > 0 ? r2(monthlyInstallment(loan) * pct / 100) : 0;
}

/** Posted repayments in the order they landed, with what each put toward the installments. */
function postedCoverage(loanId: string, payments: LoanPayment[]) {
  return payments
    .filter((p) => p.loan_id === loanId && POSTED.includes(p.status))
    .map((p) => ({
      on: dayOnly(new Date(p.paid_date ?? p.updated_at ?? p.created_at)),
      covers: Number(p.principal_portion ?? 0) + Number(p.interest_portion ?? 0),
      penalty: Number(p.penalty_portion ?? 0),
      created: p.created_at,
      id: p.id,
    }))
    .sort((a, b) => a.on.getTime() - b.on.getTime() || a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}

export function loanSchedule(loan: LoanForSchedule, payments: LoanPayment[], now: Date = new Date()): Installment[] {
  if (!loan.disbursed_at || !loan.term_months) return [];
  const released = new Date(loan.disbursed_at);
  if (isNaN(released.getTime())) return [];

  const today = dayOnly(now);
  const amount = monthlyInstallment(loan);
  const per = penaltyPerMonth(loan);
  const posted = postedCoverage(loan.id, payments);
  const settled = loan.status === 'paid';

  // Running total of posted principal + interest, with the day each total was reached.
  let cum = 0;
  const steps = posted.map((p) => ({ on: p.on, cum: (cum += p.covers) }));
  const postedTotal = cum;

  const base = Array.from({ length: loan.term_months }, (_, i) => {
    const no = i + 1;
    const dueDate = addMonths(dayOnly(released), no);
    const target = no * amount - EPS;
    const coveredOn = settled ? today : steps.find((s) => s.cum >= target)?.on ?? null;
    const end = coveredOn && coveredOn < today ? coveredOn : today;
    const monthsLate = end > dueDate ? monthsLateBetween(dueDate, end) : 0;
    return { no, dueDate, monthKey: monthKeyOf(dueDate), amount, monthsLate, penalty: r2(per * monthsLate), covered: !!coveredOn || postedTotal >= target };
  });

  // Money still in review pays the penalty first, then the next installments.
  const accrued = base.reduce((s, i) => s + i.penalty, 0);
  const penaltyPaid = posted.reduce((s, p) => s + p.penalty, 0);
  const owed = Math.max(accrued - penaltyPaid, 0);
  const reviewing = payments
    .filter((p) => p.loan_id === loan.id && IN_REVIEW.includes(p.status))
    .reduce((s, p) => s + Number(p.amount), 0);
  const reviewCovers = Math.max(reviewing - owed, 0);

  return base.map(({ covered, ...i }) => {
    const kind: InstallmentKind =
      settled || covered ? 'paid'
      : postedTotal + reviewCovers >= i.no * amount - EPS ? 'review'
      : i.dueDate < today ? 'late'
      : monthKeyOf(i.dueDate) === monthKeyOf(today) ? 'due'
      : 'upcoming';
    return { ...i, kind };
  });
}

/** Late penalty still owed on a loan — accrued so far less what posted repayments already paid toward it. */
export function loanPenaltyOwed(loan: LoanForSchedule, payments: LoanPayment[], now: Date = new Date()): number {
  if (loan.status === 'paid') return 0;
  const accrued = loanSchedule(loan, payments, now).reduce((s, i) => s + i.penalty, 0);
  const paid = postedCoverage(loan.id, payments).reduce((s, p) => s + p.penalty, 0);
  return r2(Math.max(accrued - paid, 0));
}
