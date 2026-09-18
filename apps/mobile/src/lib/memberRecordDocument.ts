import type { MemberRecordResponse, MemberRecordGroup } from '@/api/records';
import { formatPH } from './phone';

function peso(n: number): string {
  return `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateStr(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateTimeStr(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  late: 'Approved (Late)',
  submitted: 'Submitted',
  pending: 'Pending',
  rejected: 'Rejected',
  active: 'Active',
  paid: 'Paid',
  defaulted: 'Defaulted',
  cancelled: 'Cancelled',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? (status.charAt(0).toUpperCase() + status.slice(1));
}

function contributionRows(g: MemberRecordGroup): string {
  if (!g.contributions.length) return '_No contributions recorded for this cycle yet._';
  const rows = g.contributions
    .slice()
    .sort((a, b) => (a.due_date ?? a.created_at).localeCompare(b.due_date ?? b.created_at))
    .map((c) => `| ${dateStr(c.due_date)} | ${peso(c.amount)} | ${c.paid_date ? peso(c.amount) : '—'} | ${dateStr(c.paid_date)} | ${c.is_late ? statusLabel('late') : statusLabel(c.status)} | ${c.external_reference ?? '—'} |`)
    .join('\n');
  return `| Due Date | Amount Due | Amount Paid | Date Posted | Status | Reference |\n| --- | --- | --- | --- | --- | --- |\n${rows}`;
}

function loanRows(g: MemberRecordGroup): string {
  if (!g.loans.length) return '_No loans recorded for this group._';
  const rows = g.loans
    .map((l) => `| ${l.id.slice(0, 8).toUpperCase()} | ${dateStr(l.applied_at)} | ${peso(l.approved_principal ?? l.principal)} | ${l.purpose ?? '—'} | ${statusLabel(l.status)} |`)
    .join('\n');
  const table = `| Loan ID | Date Requested | Amount Approved | Purpose | Status |\n| --- | --- | --- | --- | --- |\n${rows}`;

  const details = g.loans
    .filter((l) => l.disbursed_at)
    .map((l) => [
      `**Loan Details (${l.id.slice(0, 8).toUpperCase()})**`,
      `- Approved By: ${l.approver?.full_name ?? '—'}`,
      `- Date Disbursed: ${dateStr(l.disbursed_at)}`,
      `- Ledger Reference: ${l.disbursed_ledger_entry_id ? l.disbursed_ledger_entry_id.slice(0, 8).toUpperCase() : '—'}`,
      `- Loan Term: ${l.term_months ? `${l.term_months} months` : '—'}`,
      `- Interest Rate: ${l.interest_rate != null ? `${(l.interest_rate * 100).toFixed(2)}% per month` : '—'}`,
    ].join('\n'))
    .join('\n\n');

  return details ? `${table}\n\n${details}` : table;
}

function repaymentRows(g: MemberRecordGroup): { table: string; totalPaid: number } {
  const payments = g.loans.flatMap((l) => l.payments.filter((p) => p.status === 'approved' || p.status === 'paid'));
  if (!payments.length) return { table: '_No loan repayments recorded for this group._', totalPaid: 0 };
  const rows = payments
    .sort((a, b) => (a.paid_date ?? '').localeCompare(b.paid_date ?? ''))
    .map((p) => `| ${dateStr(p.paid_date)} | ${peso(p.amount)} | ${peso(p.interest_portion)} | ${peso(p.principal_portion)} | ${p.external_reference ?? '—'} |`)
    .join('\n');
  const totalPaid = payments.reduce((t, p) => t + Number(p.amount), 0);
  return { table: `| Date | Amount Paid | Interest | Principal | Reference |\n| --- | --- | --- | --- | --- |\n${rows}`, totalPaid };
}

function groupSection(g: MemberRecordGroup): string {
  const cycleBlock = g.cycle
    ? [
        `- Cycle: ${g.cycle.name}`,
        `- Cycle Status: ${statusLabel(g.cycle.status)}`,
        `- Start Date: ${dateStr(g.cycle.start_date)}`,
        `- End Date: ${dateStr(g.cycle.end_date)}`,
        `- Monthly Contribution per Head: ${peso(g.cycle.contribution_amount)}`,
        g.cycle.contribution_due_day ? `- Contribution Due Date: ${g.cycle.contribution_due_day}th of each month` : null,
        g.cycle.default_interest_rate != null ? `- Interest Rate on Loans: ${(g.cycle.default_interest_rate * 100).toFixed(2)}% per month` : null,
      ].filter(Boolean).join('\n')
    : 'No active or past cycle yet for this group.';

  const { table: repaymentTable, totalPaid } = repaymentRows(g);

  const distributionBlock = g.distribution
    ? [
        `Status: ${statusLabel(g.distribution.status)}`,
        `Period: ${g.distribution.period}`,
        g.distribution.allocation ? `Your Allocation: ${peso(g.distribution.allocation.amount)}` : null,
      ].filter(Boolean).join('\n')
    : `Status: Not yet available — cycle still ${g.cycle?.status ?? 'not started'}.`;

  return [
    `## Group Information — ${g.group.name}`,
    '',
    `- Group Name: ${g.group.name}`,
    `- Fund Code: ${g.group.fund_code}`,
    `- Role in Group: ${g.membership.role.charAt(0).toUpperCase() + g.membership.role.slice(1)}`,
    `- Membership Status: ${statusLabel(g.membership.status)}`,
    `- Date Joined Group: ${dateStr(g.membership.joined_at)}`,
    `- Heads Assigned: ${g.membership.heads}`,
    '',
    '## Cycle Information',
    '',
    cycleBlock,
    '',
    '## Contribution Records',
    '',
    contributionRows(g),
    '',
    `- Total Contributions Paid: ${peso(g.contributionTotals.total_paid)}`,
    `- Late Occurrences: ${g.contributionTotals.late_count}`,
    `- Penalty Applied: ${peso(g.contributionTotals.penalty_applied)}`,
    '',
    '## Loan Records',
    '',
    loanRows(g),
    '',
    '## Loan Repayments',
    '',
    repaymentTable,
    '',
    `- Total Loan Repayments Paid: ${peso(totalPaid)}`,
    '',
    '## Personal Ledger Summary',
    '',
    `- Total Capital Contributed: ${peso(g.ledgerSummary.total_capital_contributed)}`,
    `- Outstanding Loan Balance: ${peso(g.ledgerSummary.outstanding_loan_balance)}`,
    `- Total Penalties Charged: ${peso(g.penaltyTotals.charged)}`,
    `- Total Penalties Waived: ${peso(g.penaltyTotals.waived)}`,
    '',
    '## Year-End Distribution',
    '',
    distributionBlock,
  ].join('\n');
}

export function buildMemberRecordMarkdown(data: MemberRecordResponse): string {
  const { member } = data;
  const header = [
    '# KapitPondo — Member Records',
    '',
    `Generated: ${dateTimeStr(data.generated_at)}`,
    '',
    `Reference No.: ${data.reference}`,
    '',
    '## Member Information',
    '',
    `- Name: ${member.full_name ?? '—'}`,
    `- Member ID: ${member.id}`,
    `- Mobile: ${member.phone ? formatPH(member.phone) : '—'}`,
    `- Email: ${member.email ?? 'not provided'}`,
    `- Account Status: ${statusLabel(member.verification_status)}`,
    `- Date Joined KapitPondo: ${dateStr(member.created_at)}`,
  ].join('\n');

  const groupSections = data.groups.length
    ? data.groups.map(groupSection).join('\n\n')
    : '_You are not part of any group yet — group, contribution, and loan records will appear here once you join one._';

  const footer = [
    '## Notes',
    '',
    '- This document reflects records approved as of the generated date and time above.',
    '- Pending or rejected entries are listed for reference but excluded from totals.',
    '- All amounts are in Philippine Pesos (PHP).',
    '- For discrepancies, contact your Group Owner or Auditor.',
    '',
    '## Document Verification',
    '',
    '- Generated by: KapitPondo System',
    '- Member Signature Line: ____________________________',
    '- Date Received: ____________________________',
  ].join('\n');

  return [header, groupSections, footer].join('\n\n');
}
