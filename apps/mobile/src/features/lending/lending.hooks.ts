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
  approveLoan,
  rejectLoan,
  recordRepayment,
  type ApplyLoanInput,
  type LoanStatus,
  type RecordRepaymentInput,
} from '../../api/lending';

export function useLoans(groupId: string, filters: { status?: LoanStatus } = {}) {
  const fn = useCallback(() => listLoans(groupId, filters), [groupId, filters.status]);
  return useQuery(fn, [groupId, filters.status]);
}

/** Loan + payments. Safe to call with no loanId yet (e.g. still resolving which loan is active). */
export function useLoan(groupId: string, loanId?: string) {
  const fn = useCallback(
    () => (loanId ? getLoan(groupId, loanId) : Promise.resolve(null)),
    [groupId, loanId],
  );
  return useQuery(fn, [groupId, loanId]);
}

/** Available fund cash — compare against the principal before approving. */
export function useLiquidity(groupId: string) {
  const fn = useCallback(() => getLiquidity(groupId), [groupId]);
  return useQuery(fn, [groupId]);
}

export function useApplyLoan(groupId: string) {
  return useAction((input: ApplyLoanInput) => applyLoan(groupId, input));
}

/** approve(loanId, monthlyRate) — e.g. approve(id, 0.03) for 3% monthly. */
export function useApproveLoan(groupId: string) {
  return useAction((loanId: string, interestRate: number) =>
    approveLoan(groupId, loanId, interestRate),
  );
}

export function useRejectLoan(groupId: string) {
  return useAction((loanId: string, reason?: string) => rejectLoan(groupId, loanId, reason));
}

export function useRecordRepayment(groupId: string) {
  return useAction((loanId: string, input: RecordRepaymentInput) =>
    recordRepayment(groupId, loanId, input),
  );
}