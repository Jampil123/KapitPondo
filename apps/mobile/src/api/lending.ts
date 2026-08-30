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

// 'cancelled' = the borrower withdrew their own still-pending request (migration
// 0041) — distinct from 'rejected', which is an Owner decision. 'defaulted' is
// in the DB enum but no code path ever sets it — dead status, kept for parity.
export type LoanStatus = 'pending' | 'approved' | 'active' | 'paid' | 'rejected' | 'cancelled' | 'defaulted';
export type LoanPaymentStatus = 'scheduled' | 'submitted' | 'approved' | 'paid' | 'late' | 'partial' | 'rejected';
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
  /** Who actually released the funds — a separate step/actor from approval (see disburseLoan()). Null until disbursed. */
  disburser: { full_name: string } | null;
  /** Who the loan actually belongs to (the borrower) — not who approved it. */
  membership: { member_id: string; members: { full_name: string } | null } | null;
}

export interface LoanEligibility {
  eligible: boolean;
  reasons: string[];
  available_cash: Money;
  requested_principal: Money;
}

/** Same checks as LoanEligibility, run against the caller's own membership before any loan exists — see getMemberLoanEligibility(). */
export interface MemberLoanEligibility {
  eligible: boolean;
  reasons: string[];
  available_cash: Money;
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
  /** Set only when status is 'rejected'. */
  rejection_reason: string | null;
  created_at: string;
  /** Who recorded this repayment (the member who submitted it, or the officer who recorded it directly). Null for gateway-auto-confirmed payments — see auto_confirmed. */
  recorder: { full_name: string } | null;
  /** The different officer who confirmed/verified it (segregation of duties) — null while 'submitted', and null for gateway-auto-confirmed payments. */
  verifier: { full_name: string } | null;
  /**
   * Payment gateway fields — FUTURE PLAN, not live (see
   * services/api/src/modules/payments). Always null/false today; once a
   * real provider is wired up, a repayment paid through it arrives with
   * auto_confirmed: true and no recorder/verifier, since the gateway's own
   * signed webhook confirmation stands in for the human recorder/approver
   * pair — and for the reference number, which no longer needs typing in.
   */
  gateway_provider: string | null;
  gateway_reference: string | null;
  auto_confirmed: boolean;
  /** Only present on the group-wide listRepayments() — who the loan (and therefore this repayment) belongs to. */
  loans?: { id: string; group_id: string; membership_id: string; membership: { member_id: string; members: { full_name: string } | null } | null };
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

/** GET — member-safe: am I eligible to request a loan right now, and how much cash does the fund have. Same 3 checks as getLoanEligibility, before any loan exists. */
export function getMemberLoanEligibility(groupId: string) {
  return api.get<MemberLoanEligibility>(`/api/groups/${groupId}/loans/eligibility`);
}

/** POST — the borrower withdraws their own request. Only works while status is still 'pending'. */
export function cancelLoan(groupId: string, loanId: string) {
  return api.post<{ loan: Loan }>(`/api/groups/${groupId}/loans/${loanId}/cancel`);
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
 * POST — record a loan repayment DIRECTLY (officer received it in person).
 * Server allocates interest first, then principal, and posts the ledger
 * entry immediately (record_loan_repayment RPC) — no confirmation step.
 */
export function recordRepayment(groupId: string, loanId: string, input: RecordRepaymentInput) {
  return api.post<{ message: string; ledgerEntry: unknown }>(
    `/api/groups/${groupId}/loans/${loanId}/repayments`,
    input,
  );
}

export interface SubmitRepaymentInput {
  amount: string; // clean decimal string
  payment_method?: PaymentMethod;
  proof_url?: string;
  external_reference?: string;
}

/**
 * POST — member submits a repayment claim + proof for THEIR OWN loan. No
 * money posts yet — a different officer must confirmRepayment() it first.
 * Mirrors the contribution submit→approve flow.
 */
export function submitRepayment(groupId: string, loanId: string, input: SubmitRepaymentInput) {
  return api.post<{ message: string; payment: LoanPayment }>(
    `/api/groups/${groupId}/loans/${loanId}/repayments/submit`,
    input,
  );
}

/** GET — repayments across the group's loans. Members see only their own; officers see all (optionally filtered by status). */
export async function listRepayments(groupId: string, status?: LoanPaymentStatus) {
  const res = await api.get<{ repayments: LoanPayment[] }>(`/api/groups/${groupId}/repayments`, status ? { status } : undefined);
  return res.repayments;
}

/** POST — confirm a submitted repayment claim (a DIFFERENT officer than whoever submitted it). Posts the ledger credit and updates the loan balance. */
export function confirmRepayment(groupId: string, paymentId: string) {
  return api.post<{ message: string; ledgerEntry: unknown }>(`/api/groups/${groupId}/repayments/${paymentId}/confirm`);
}

/** POST — reject a submitted repayment claim, with a reason (officers). */
export function rejectRepayment(groupId: string, paymentId: string, reason?: string) {
  return api.post<{ message: string; payment: LoanPayment }>(
    `/api/groups/${groupId}/repayments/${paymentId}/reject`,
    reason ? { reason } : undefined,
  );
}