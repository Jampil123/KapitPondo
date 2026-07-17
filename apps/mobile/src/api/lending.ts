/**
 * api/lending.ts
 * ----------------------------------------------------------------------------
 * Calls the lending module of the API (M6).
 *
 * Flow: apply (member, verified only) -> Owner reviews eligibility -> Owner
 * approves (the lending decision — sets the rate, optionally a partial
 * amount if liquidity is short) -> Treasurer or Owner disburses (separate
 * step, posts the ledger entry) -> loan active -> repayments (interest-first
 * allocation, server-side).
 *
 * approve() and disburse() are deliberately two separate calls: the Owner's
 * decision is segregated from the actual disbursement, matching §1.2 — a
 * Treasurer alone can no longer both approve and disburse a loan.
 *
 * The server blocks an officer from approving their OWN loan; approve() will
 * throw an ApiError in that case.
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type LoanStatus = 'pending' | 'approved' | 'active' | 'paid' | 'rejected' | 'defaulted';
export type LoanPaymentStatus = 'scheduled' | 'submitted' | 'approved' | 'paid' | 'late' | 'partial';
export type PaymentMethod = 'paymongo' | 'gcash' | 'cash' | 'bank_transfer' | 'other';

export interface Loan {
  id: string;
  membership_id: string;
  group_id: string;
  principal: Money;
  approved_principal: Money | null; // may be less than principal — TC-040 partial approval
  interest_rate: Money | null; // monthly decimal, e.g. "0.03" = 3%; null until approved
  term_months: number;
  purpose: string | null;
  status: LoanStatus;
  outstanding_balance: Money;
  applied_at: string;
  approved_at: string | null;
  disbursed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  /** Who made the lending decision (approve/reject) — not necessarily who disbursed it. */
  approver: { full_name: string } | null;
}

export interface LoanEligibility {
  eligible: boolean;
  reasons: string[];
  available_cash: Money;
  requested_principal: Money;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  amount: Money;
  principal_portion: Money;
  interest_portion: Money;
  due_date: string | null;
  paid_date: string | null;
  status: LoanPaymentStatus;
  proof_url: string | null;
  /** Short-lived viewable URL for proof_url (private storage path) — regenerated on every fetch. */
  proof_signed_url: string | null;
  created_at: string;
  /** Who recorded this repayment. */
  recorder: { full_name: string } | null;
  /** The different officer who verified it (segregation of duties). */
  verifier: { full_name: string } | null;
}

export interface Liquidity {
  available_cash: Money; // from group_available_cash RPC — verify field name on first run
}

// --- Apply / list / detail --------------------------------------------------

export interface ApplyLoanInput {
  principal: string; // clean decimal string
  term_months: number;
  purpose?: string;
}

/** POST — apply for a loan (status: pending). Interest is set later at approval. */
export function applyLoan(groupId: string, input: ApplyLoanInput) {
  return api.post<{ loan: Loan }>(`/api/groups/${groupId}/loans`, input);
}

/** GET — list loans. Members see only their own; officers see all. */
export async function listLoans(groupId: string, filters: { status?: LoanStatus } = {}) {
  const res = await api.get<{ loans: Loan[] }>(`/api/groups/${groupId}/loans`, filters);
  return res.loans;
}

/** GET — one loan plus its payments. Members can only see their own. */
export function getLoan(groupId: string, loanId: string) {
  return api.get<{ loan: Loan; payments: LoanPayment[] }>(`/api/groups/${groupId}/loans/${loanId}`);
}

/** GET — available fund cash. Check this >= principal before approving (M6.3). */
export function getLiquidity(groupId: string) {
  return api.get<Liquidity>(`/api/groups/${groupId}/liquidity`);
}

/** GET — what the Owner should review before deciding: verified status, an existing active loan, a missed contribution on file, and current liquidity. */
export function getLoanEligibility(groupId: string, loanId: string) {
  return api.get<LoanEligibility>(`/api/groups/${groupId}/loans/${loanId}/eligibility`);
}

// --- Decision / disbursement / repayment ------------------------------------

/**
 * POST — the Owner's lending decision. `interestRate` is the MONTHLY decimal
 * rate (0.03 = 3%). `approvedPrincipal` lets the Owner approve less than
 * requested when liquidity is short (TC-040) — defaults to the full amount.
 * Does NOT disburse — loan moves to 'approved', awaiting disburseLoan().
 * Throws if the caller is the borrower (own-loan guard), or if the loan is
 * ineligible (unverified borrower, an existing active loan, a missed
 * contribution on file, or insufficient liquidity for the approved amount).
 */
export function approveLoan(groupId: string, loanId: string, interestRate: number, approvedPrincipal?: string) {
  return api.post<{ loan: Loan }>(
    `/api/groups/${groupId}/loans/${loanId}/approve`,
    { interest_rate: interestRate, approved_principal: approvedPrincipal },
  );
}

/** POST — disburse an already-approved loan (Treasurer or Owner). Posts the disbursement ledger entry; loan -> active. */
export function disburseLoan(groupId: string, loanId: string) {
  return api.post<{ message: string; ledgerEntry: unknown }>(
    `/api/groups/${groupId}/loans/${loanId}/disburse`,
  );
}

/** POST — reject a pending loan (status: rejected). */
export function rejectLoan(groupId: string, loanId: string, reason?: string) {
  return api.post<{ loan: Loan }>(
    `/api/groups/${groupId}/loans/${loanId}/reject`,
    reason ? { reason } : undefined,
  );
}

export interface RecordRepaymentInput {
  amount: string; // clean decimal string
  payment_method?: PaymentMethod;
  proof_url?: string;
  external_reference?: string;
  /** A different officer who approves this repayment (segregation of duties). */
  approver_id?: string;
}

/**
 * POST — record a loan repayment. Server allocates interest first, then
 * principal, and posts the ledger entries (record_loan_repayment RPC).
 */
export function recordRepayment(groupId: string, loanId: string, input: RecordRepaymentInput) {
  return api.post<{ payment: LoanPayment; loan: Loan }>(
    `/api/groups/${groupId}/loans/${loanId}/repayments`,
    input,
  );
}