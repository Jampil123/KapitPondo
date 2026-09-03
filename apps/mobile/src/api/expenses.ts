/**
 * api/expenses.ts
 * ----------------------------------------------------------------------------
 * Calls the expenses module of the API (M7). Same shape as contributions:
 * record (treasurer/owner) -> approve by a DIFFERENT officer (owner/auditor) ->
 * ledger posts an expense outflow.
 *
 * Expenses feed the year-end formula (M9): net income = interest + penalties − expenses.
 *
 * Note the role split differs from contributions: here RECORD is treasurer/owner
 * and APPROVE is owner/auditor (see constants/roles.ts).
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type ExpenseStatus = 'submitted' | 'approved' | 'rejected';

export interface Expense {
  id: string;
  group_id: string;
  amount: Money;
  category: string | null;
  description: string | null;
  proof_url: string | null;
  /** Short-lived viewable URL for proof_url (private storage path) — regenerated on every fetch. */
  proof_signed_url: string | null;
  status: ExpenseStatus;
  recorded_by: string | null; // member id of recorder
  approved_by: string | null; // member id of approver (set on approve)
  /** Set only when status is 'rejected' — real column added migration 0046. */
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Who recorded this — null-safe join, listExpenses only. */
  recorder: { full_name: string } | null;
  /** Who approved it — null until approved. */
  approver: { full_name: string } | null;
}

export interface RecordExpenseInput {
  amount: string; // clean decimal string
  category?: string;
  description?: string;
  proof_url?: string;
}

/** POST — record an expense (status: submitted). Treasurer/owner. */
export function recordExpense(groupId: string, input: RecordExpenseInput) {
  return api.post<{ expense: Expense }>(`/api/groups/${groupId}/expenses`, input);
}

/** GET — list expenses. Optional status filter. */
export async function listExpenses(groupId: string, filters: { status?: ExpenseStatus } = {}) {
  const res = await api.get<{ expenses: Expense[] }>(`/api/groups/${groupId}/expenses`, filters);
  return res.expenses;
}

/**
 * POST — approve an expense (owner/auditor). Posts the ledger entry via
 * approve_expense RPC. Throws ApiError if the caller recorded it (SoD).
 */
export function approveExpense(groupId: string, expenseId: string) {
  return api.post<{ expense: Expense; ledger_entry?: unknown }>(
    `/api/groups/${groupId}/expenses/${expenseId}/approve`,
  );
}

/** POST — reject an expense, with a reason the recorder can see (status: rejected). Officer other than the recorder. */
export function rejectExpense(groupId: string, expenseId: string, reason?: string) {
  return api.post<{ expense: Expense }>(
    `/api/groups/${groupId}/expenses/${expenseId}/reject`,
    reason ? { reason } : undefined,
  );
}