/**
 * api/lending.ts
 * ----------------------------------------------------------------------------
 * Calls the lending module of the API (M6).
 *
 * Flow: apply (member) -> check liquidity -> approve+disburse (officer) ->
 * loan active -> repayments (interest-first allocation, server-side).
 *
 * TWO CONTROL NOTES (both from the spec, both worth knowing for the panel):
 *  - approve() is APPROVE *and* DISBURSE fused into one call (approve_and_disburse_loan
 *    RPC). Spec §1.2 wanted authorization (Owner's decision) SEPARATE from
 *    disbursement (Treasurer's execution); the live API merges them and lets
 *    either treasurer or owner do both. See SPEC-DIVERGENCE in constants/roles.ts.
 *  - The server blocks an officer from approving their OWN loan; approve() will
 *    throw an ApiError in that case.
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
  interest_rate: Money | null; // monthly decimal, e.g. "0.03" = 3%; null until approved
  term_months: number;
  purpose: string | null;
  status: LoanStatus;
  outstanding_balance: Money;
  applied_at: string;
  approved_at: string | null;
  created_at: string;
  /** Who approved (and disbursed — the two are one fused action) this loan. */
  approver: { full_name: string } | null;
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

// --- Decision / disbursement / repayment ------------------------------------

/**
 * POST — approve AND disburse a loan in one step. `interestRate` is the MONTHLY
 * decimal rate (0.03 = 3%). Posts the disbursement ledger entry; loan -> active.
 * Throws if the caller is the borrower (own-loan guard).
 */
export function approveLoan(groupId: string, loanId: string, interestRate: number) {
  return api.post<{ loan: Loan; ledger_entry?: unknown }>(
    `/api/groups/${groupId}/loans/${loanId}/approve`,
    { interest_rate: interestRate },
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