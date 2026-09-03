/**
 * features/lending/lending.hooks.ts
 * ----------------------------------------------------------------------------
 * Hooks for the lending flow (M6).
 *
 *   // Member: apply
 *   const { run: apply } = useApplyLoan(groupId);
 *   await apply({ principal: toAmountString(input)!, term_months: 6, purpose });
 *
 *   // Officer: check the fund can cover it, then approve+disburse
 *   const { data: liquidity } = useLiquidity(groupId);
 *   const { run: approve, error } = useApproveLoan(groupId);
 *   await approve(loan.id, 0.03);   // 3% monthly; error if approving own loan
 *
 *   // Detail screen (loan + payments)
 *   const { data } = useLoan(groupId, loanId);  // data.loan, data.payments
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import {
  applyLoan,
  listLoans,
  getLoan,
  getLiquidity,
  getLoanEligibility,
  getMemberLoanEligibility,
  cancelLoan,
  approveLoan,
  disburseLoan,
  rejectLoan,
  submitRepayment,
  listRepayments,
  confirmRepayment,
  rejectRepayment,
  type ApplyLoanInput,
  type LoanStatus,
  type LoanPaymentStatus,
  type SubmitRepaymentInput,
} from '../../api/lending';

export function useLoans(groupId: string, filters: { status?: LoanStatus } = {}) {
  const fn = useCallback(() => listLoans(groupId, filters), [groupId, filters.status]);
  return useQuery(fn, [groupId, filters.status], { table: 'loans', filter: `group_id=eq.${groupId}` });
}

/** Loan + payments. Safe to call with no loanId yet (e.g. still resolving which loan is active). */
export function useLoan(groupId: string, loanId?: string) {
  const fn = useCallback(
    () => (loanId ? getLoan(groupId, loanId) : Promise.resolve(null)),
    [groupId, loanId],
  );
  return useQuery(
    fn,
    [groupId, loanId],
    loanId ? [{ table: 'loans', filter: `id=eq.${loanId}` }, { table: 'loan_payments', filter: `loan_id=eq.${loanId}` }] : null,
  );
}

/** Available fund cash — compare against the principal before approving. */
export function useLiquidity(groupId: string) {
  const fn = useCallback(() => getLiquidity(groupId), [groupId]);
  return useQuery(fn, [groupId], { table: 'ledger_entries', filter: `group_id=eq.${groupId}` });
}

export function useApplyLoan(groupId: string) {
  return useAction((input: ApplyLoanInput) => applyLoan(groupId, input));
}

/** What the Owner should review before deciding. Safe to call with no loanId yet. */
export function useLoanEligibility(groupId: string, loanId?: string) {
  const fn = useCallback(
    () => (loanId ? getLoanEligibility(groupId, loanId) : Promise.resolve(null)),
    [groupId, loanId],
  );
  return useQuery(fn, [groupId, loanId]);
}

/** approve(loanId, monthlyRate, approvedPrincipal?) — e.g. approve(id, 0.03) for 3% monthly. Does NOT disburse. */
export function useApproveLoan(groupId: string) {
  return useAction((loanId: string, interestRate: number, approvedPrincipal?: string) =>
    approveLoan(groupId, loanId, interestRate, approvedPrincipal),
  );
}

/** disburse(loanId) — separate step after approval, Treasurer or Owner. */
export function useDisburseLoan(groupId: string) {
  return useAction((loanId: string) => disburseLoan(groupId, loanId));
}

export function useRejectLoan(groupId: string) {
  return useAction((loanId: string, reason?: string) => rejectLoan(groupId, loanId, reason));
}

/** Member-safe: am I eligible to request a loan right now, and how much fund cash exists — before any loan is submitted. */
export function useMemberLoanEligibility(groupId: string) {
  const fn = useCallback(() => getMemberLoanEligibility(groupId), [groupId]);
  return useQuery(fn, [groupId], [
    { table: 'loans', filter: `group_id=eq.${groupId}` },
    // available_cash is a live sum over the ledger — a disbursement/repayment
    // elsewhere in the group changes it without necessarily touching `loans`.
    { table: 'ledger_entries', filter: `group_id=eq.${groupId}` },
  ]);
}

/** The borrower withdraws their own still-pending request. */
export function useCancelLoan(groupId: string) {
  return useAction((loanId: string) => cancelLoan(groupId, loanId));
}

/** Submit a repayment claim + proof — the borrower's own, or an officer recording on the borrower's behalf. Needs a different officer to confirmRepayment(). */
export function useSubmitRepayment(groupId: string) {
  return useAction((loanId: string, input: SubmitRepaymentInput) =>
    submitRepayment(groupId, loanId, input),
  );
}

/**
 * Repayments across the group's loans — the officer's pending queue, or a
 * member's own history/status. loan_payments has no group_id of its own
 * (only reachable via loan_id → loans.group_id), and postgres_changes can't
 * filter on a joined column, so this watches every loan_payments change
 * un-scoped rather than missing group-relevant ones — harmless over-trigger,
 * not a security concern (listRepayments() itself is properly group-scoped
 * server-side).
 */
export function useRepayments(groupId: string, status?: LoanPaymentStatus) {
  const fn = useCallback(() => listRepayments(groupId, status), [groupId, status]);
  return useQuery(fn, [groupId, status], { table: 'loan_payments' });
}

export function useConfirmRepayment(groupId: string) {
  return useAction((paymentId: string) => confirmRepayment(groupId, paymentId));
}

export function useRejectRepayment(groupId: string) {
  return useAction((paymentId: string, reason?: string) => rejectRepayment(groupId, paymentId, reason));
}