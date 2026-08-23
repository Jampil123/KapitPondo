/**
 * features/expenses/expenses.hooks.ts
 * ----------------------------------------------------------------------------
 * Hooks for the expense flow (M7).
 *
 *   const { data: expenses, loading, refetch } = useExpenses(groupId, { status });
 *
 *   const { run: record } = useRecordExpense(groupId);
 *   await record({ amount: toAmountString(input)!, category, description, proof_url });
 *
 *   // Approve (owner/auditor, must differ from recorder)
 *   const { run: approve, error } = useApproveExpense(groupId);
 *   await approve(expense.id).then(refetch);
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import {
  listExpenses,
  recordExpense,
  approveExpense,
  rejectExpense,
  type ExpenseStatus,
  type RecordExpenseInput,
} from '../../api/expenses';

export function useExpenses(groupId: string, filters: { status?: ExpenseStatus } = {}) {
  const fn = useCallback(() => listExpenses(groupId, filters), [groupId, filters.status]);
  return useQuery(fn, [groupId, filters.status], { table: 'expenses', filter: `group_id=eq.${groupId}` });
}

export function useRecordExpense(groupId: string) {
  return useAction((input: RecordExpenseInput) => recordExpense(groupId, input));
}

export function useApproveExpense(groupId: string) {
  return useAction((expenseId: string) => approveExpense(groupId, expenseId));
}

export function useRejectExpense(groupId: string) {
  return useAction((expenseId: string, reason?: string) =>
    rejectExpense(groupId, expenseId, reason),
  );
}