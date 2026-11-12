import { useCallback } from 'react';
import { api } from '../../api/client';
import { useQuery } from '../../hooks/useApi';
import { formatPeso } from '../../lib/money';
import { buildSimplePdf, sharePdf, pdfFilename, type PdfBlock } from '../../lib/simplePdf';
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
  const typeRows = (m: FinancialReport['money_in']) => Object.entries(m).map(([t, v]) => ({ label: typeLabel(t), value: peso(v ?? 0) }));
  const blocks: PdfBlock[] = [
    { kind: 'heading', text: 'Cash' },
    { kind: 'pairs', rows: [
      { label: 'Cash at start', value: peso(data.cash.opening) },
      { label: 'Money in', value: peso(data.cash.money_in) },
      { label: 'Money out', value: peso(data.cash.money_out) },
      { label: 'Cash at end', value: peso(data.cash.closing), bold: true },
    ] },
  ];
  const moneyIn = typeRows(data.money_in);
  const moneyOut = typeRows(data.money_out);
  if (moneyIn.length) blocks.push({ kind: 'heading', text: 'Money in' }, { kind: 'pairs', rows: moneyIn });
  if (moneyOut.length) blocks.push({ kind: 'heading', text: 'Money out' }, { kind: 'pairs', rows: moneyOut });
  blocks.push(
    { kind: 'heading', text: 'Loans' },
    { kind: 'pairs', rows: [
      { label: 'Released this period', value: peso(data.loans.released) },
      { label: 'Principal repaid', value: peso(data.loans.principal_repaid) },
      { label: 'Interest earned', value: peso(data.loans.interest_earned) },
      { label: 'Active loans today', value: String(data.loans.active_count) },
      { label: 'Still owed today', value: peso(data.loans.outstanding) },
    ] },
    { kind: 'heading', text: 'Penalties' },
    { kind: 'pairs', rows: [
      { label: 'Charged this period', value: peso(data.penalties.charged) },
      { label: 'Paid this period', value: peso(data.penalties.paid) },
      { label: 'Waived this period', value: peso(data.penalties.waived) },
      { label: 'Unpaid today', value: peso(data.penalties.pending) },
    ] },
    { kind: 'heading', text: 'Members (today)', count: data.members.length },
    {
      kind: 'table',
      head: ['Name', 'Role', 'Status', 'Heads', 'Contributed', 'Loan owed', 'Unpaid penalties'],
      widths: [2.4, 1.2, 1.1, 0.8, 1.5, 1.5, 1.5],
      align: ['left', 'left', 'left', 'right', 'right', 'right', 'right'],
      rows: data.members.map((m) => [
        m.name, ROLE[m.role] ?? m.role, m.status === 'suspended' ? 'Suspended' : 'Active', String(m.heads),
        peso(m.contributed), peso(m.loan_outstanding), peso(m.penalties_pending),
      ]),
      empty: 'No members.',
    },
  );
  const bytes = await buildSimplePdf({
    title: 'Financial report',
    subtitle: groupName,
    meta: [`${period.label} (${period.from} to ${period.to})`],
    blocks,
  });
  await sharePdf(pdfFilename(`${groupName}-financial-report-${period.from}-to-${period.to}`), bytes);
}
