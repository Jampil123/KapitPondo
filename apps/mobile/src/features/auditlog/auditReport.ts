/**
 * features/auditlog/auditReport.ts
 * ----------------------------------------------------------------------------
 * The Auditor's exported report for a period: verified records, rejected
 * records with reasons, flags, findings and loan decision audits — as a CSV.
 * PDF is switched off for now: it needs expo-print, a native module the
 * current dev client doesn't include (see PDF_EXPORT_ENABLED). The
 * Export screen loads the sections once (useAuditReport) to show the counts,
 * then hands the same sections to exportAuditReport.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '../../hooks/useApi';
import { exportAuditLog, type AuditLogEntry } from '../../api/auditLog';
import { listFindings, type AuditFinding } from '../../api/findings';
import { listFlags, type AuditFlag } from '../../api/flags';
import { listLoanAudits, type LoanAudit } from '../../api/loanAudits';
import { formatPeso } from '../../lib/money';
import { shareCsv } from '../../lib/csv';
import { describe, ROLE_LABEL, isPostingSignoff } from './describe';
import { recordLabel } from '../flags/flagStatus';

export type ReportSection = 'verified' | 'rejected' | 'flags' | 'findings' | 'loans';
export type ReportFormat = 'pdf' | 'csv';
/** Flip on after adding expo-print and rebuilding the dev client. */
export const PDF_EXPORT_ENABLED = false;
/** Local ISO dates, both inclusive. */
export type ReportPeriod = { label: string; from: string; to: string };

export interface AuditReportData {
  verified: AuditLogEntry[];
  rejected: AuditLogEntry[];
  flags: AuditFlag[];
  findings: AuditFinding[];
  loans: LoanAudit[];
  truncated: boolean;
}

export const SECTION_LABEL: Record<ReportSection, string> = {
  verified: 'Verified records',
  rejected: 'Rejected records and reasons',
  flags: 'Flags and their status',
  findings: 'Audit findings',
  loans: 'Loan decision audits',
};


const startOf = (iso: string) => new Date(`${iso}T00:00:00`).toISOString();
const endOf = (iso: string) => new Date(new Date(`${iso}T00:00:00`).getTime() + 86400000).toISOString();

function stamp(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function day(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Everything the report can include for the period, loaded once. */
export function useAuditReport(groupId: string, period: ReportPeriod) {
  const from = startOf(period.from);
  const to = endOf(period.to);
  const fn = useCallback(async (): Promise<AuditReportData> => {
    const [{ entries, truncated }, findings, flags, loans] = await Promise.all([
      exportAuditLog(groupId, { from, to }), listFindings(groupId), listFlags(groupId), listLoanAudits(groupId),
    ]);
    const inRange = (iso: string) => {
      const t = new Date(iso).toISOString();
      return t >= from && t < to;
    };
    const byDate = (a: AuditLogEntry, b: AuditLogEntry) => (a.created_at < b.created_at ? -1 : 1);
    return {
      verified: entries.filter(isPostingSignoff).sort(byDate),
      rejected: entries.filter((e) => e.action === 'rejected').sort(byDate),
      flags: flags.filter((f) => inRange(f.created_at)),
      findings: findings.filter((f) => inRange(f.created_at)),
      loans: loans.filter((l) => inRange(l.approved_at)),
      truncated,
    };
  }, [groupId, from, to]);
  const q = useQuery(fn, [groupId, from, to]);
  const counts = useMemo(() => (q.data ? {
    verified: q.data.verified.length,
    rejected: q.data.rejected.length,
    flags: q.data.flags.length,
    findings: q.data.findings.length,
    loans: q.data.loans.length,
  } : null), [q.data]);
  return { ...q, counts };
}

/* ---------------- One table per section ---------------- */
type Table = { title: string; head: string[]; rows: string[][] };

function tables(data: AuditReportData, include: ReportSection[]): Table[] {
  const who = (e: AuditLogEntry) => `${e.actor?.full_name ?? ''}${e.actor_role ? ` (${ROLE_LABEL[e.actor_role] ?? e.actor_role})` : ''}`;
  const all: Record<ReportSection, Table> = {
    verified: {
      title: SECTION_LABEL.verified,
      head: ['Date', 'Record', 'Verified by'],
      rows: data.verified.map((e) => [stamp(e.created_at), describe(e).title, who(e)]),
    },
    rejected: {
      title: SECTION_LABEL.rejected,
      head: ['Date', 'Record', 'Rejected by', 'Reason'],
      rows: data.rejected.map((e) => {
        const d = describe(e);
        return [stamp(e.created_at), d.title, who(e), d.reason ?? ''];
      }),
    },
    flags: {
      title: SECTION_LABEL.flags,
      head: ['Flag', 'Raised', 'Record', 'Reason', 'Status', 'Note'],
      rows: data.flags.map((f) => [f.ref, day(f.created_at), recordLabel(f), f.reason, f.status, f.resolution_note ?? f.note ?? '']),
    },
    findings: {
      title: SECTION_LABEL.findings,
      head: ['Finding', 'Submitted', 'Title', 'What was found', 'Recommendation', 'Status', 'Organizer note'],
      rows: data.findings.map((f) => [f.ref, day(f.created_at), f.title, f.details ?? '', f.recommendation ?? '', f.status, f.resolution_note ?? '']),
    },
    loans: {
      title: SECTION_LABEL.loans,
      head: ['Loan', 'Borrower', 'Approved', 'Amount', 'Checks', 'Failed checks'],
      rows: data.loans.map((l) => [
        l.ref, l.borrower ?? '', day(l.approved_at), formatPeso(l.approved_principal ?? l.principal),
        l.failed ? `${l.failed} failed` : 'All passed',
        l.checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`).join('; '),
      ]),
    },
  };
  return include.map((k) => all[k]);
}

/** Builds the report from already-loaded sections and opens the share sheet. */
export async function exportAuditReport({ groupName, period, data, include, format }: {
  groupName: string;
  period: ReportPeriod;
  data: AuditReportData;
  include: ReportSection[];
  format: ReportFormat;
}) {
  if (format === 'pdf' && !PDF_EXPORT_ENABLED) throw new Error('PDF export isn’t available yet — choose CSV.');
  const base = `${groupName.replace(/\s+/g, '-')}-audit-report-${period.from}-to-${period.to}`;

  const rows: string[][] = [
    ['Audit report', groupName],
    ['Period', `${period.label} (${period.from} to ${period.to})`],
    ['Generated', stamp(new Date().toISOString())],
  ];
  tables(data, include).forEach((t) => rows.push([], [t.title.toUpperCase(), String(t.rows.length)], t.head, ...t.rows));
  await shareCsv(`${base}.csv`, rows);
}
