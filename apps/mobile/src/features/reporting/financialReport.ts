import { useCallback } from 'react';
import { api } from '../../api/client';
import { useQuery } from '../../hooks/useApi';
import { formatPeso } from '../../lib/money';
import { shareCsv } from '../../lib/csv';
import type { LedgerEntryType } from '../../api/ledger';
import type { ReportPeriod } from '../auditlog/auditReport';

export interface FinancialReport {
  cash: { opening: number; money_in: number; money_out: number; closing: number };
  money_in: Partial<Record<LedgerEntryType, number>>;
  money_out: Partial<Record<LedgerEntryType, number>>;
  loans: { released: number; principal_repaid: number; interest_earned: number; active_count: number; outstanding: number };
  penalties: { charged: number; paid: number; waived: number; pending: number };
  members: { name: string; role: string; status: string; heads: number; contributed: number; loan_outstanding: number; penalties_pending: number }[];
}

const TYPE_LABEL: Record<LedgerEntryType, string> = {
  contribution: 'Contributions',
  loan_repayment: 'Loan repayments',
  penalty: 'Penalties',
  loan_disbursement: 'Loans released',
  distribution: 'Year-end shares',
  withdrawal: 'Withdrawal payouts',
  expense: 'Expenses',
  fee: 'Fees',
  adjustment: 'Adjustments',
  reversal: 'Reversals',
};
export const typeLabel = (t: string) => TYPE_LABEL[t as LedgerEntryType] ?? t;

const ROLE: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

const startOf = (iso: string) => new Date(`${iso}T00:00:00`).toISOString();
const endOf = (iso: string) => new Date(new Date(`${iso}T00:00:00`).getTime() + 86400000).toISOString();

export function useFinancialReport(groupId: string, period: ReportPeriod) {
  const from = startOf(period.from);
  const to = endOf(period.to);
  const fn = useCallback(
    () => api.get<{ report: FinancialReport }>(`/api/groups/${groupId}/reports/financial`, { from, to }).then((r) => r.report),
    [groupId, from, to],
  );
  return useQuery(fn, [groupId, from, to]);
}

export async function exportFinancialReport({ groupName, period, data }: { groupName: string; period: ReportPeriod; data: FinancialReport }) {
  const peso = (n: number) => formatPeso(n);
  const rows: (string | number)[][] = [
    ['Financial report', groupName],
    ['Period', `${period.label} (${period.from} to ${period.to})`],
    ['Generated', new Date().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })],
    [],
    ['CASH'],
    ['Cash at start', peso(data.cash.opening)],
    ['Money in', peso(data.cash.money_in)],
    ['Money out', peso(data.cash.money_out)],
    ['Cash at end', peso(data.cash.closing)],
    [],
    ['MONEY IN', 'Amount'],
    ...Object.entries(data.money_in).map(([t, v]) => [typeLabel(t), peso(v ?? 0)]),
    [],
    ['MONEY OUT', 'Amount'],
    ...Object.entries(data.money_out).map(([t, v]) => [typeLabel(t), peso(v ?? 0)]),
    [],
    ['LOANS'],
    ['Released this period', peso(data.loans.released)],
    ['Principal repaid', peso(data.loans.principal_repaid)],
    ['Interest earned', peso(data.loans.interest_earned)],
    ['Active loans today', data.loans.active_count],
    ['Still owed today', peso(data.loans.outstanding)],
    [],
    ['PENALTIES'],
    ['Charged this period', peso(data.penalties.charged)],
    ['Paid this period', peso(data.penalties.paid)],
    ['Waived this period', peso(data.penalties.waived)],
    ['Unpaid today', peso(data.penalties.pending)],
    [],
    ['MEMBERS (today)', String(data.members.length)],
    ['Name', 'Role', 'Status', 'Heads', 'Contributed', 'Loan owed', 'Unpaid penalties'],
    ...data.members.map((m) => [
      m.name, ROLE[m.role] ?? m.role, m.status === 'suspended' ? 'Suspended' : 'Active', m.heads,
      peso(m.contributed), peso(m.loan_outstanding), peso(m.penalties_pending),
    ]),
  ];
  await shareCsv(`${groupName.replace(/\s+/g, '-')}-financial-report-${period.from}-to-${period.to}.csv`, rows);
}
