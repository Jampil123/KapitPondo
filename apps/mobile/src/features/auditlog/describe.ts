/**
 * features/auditlog/describe.ts
 * ----------------------------------------------------------------------------
 * Turns a raw audit_log row into readable copy — shared by the Auditor's log
 * and the Owner dashboard's Activity card.
 */
import { formatPeso } from '../../lib/money';
import type { AuditLogEntry } from '../../api/auditLog';

export const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };
function fmtValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // money-shaped decimal strings ("1500.00") read better as pesos
    if (/^\d+(\.\d{1,2})?$/.test(v)) return formatPeso(v);
    return v;
  }
  return String(v);
}

/** Turns one raw audit_log row into what the card actually shows — the one
 * place that knows what before_data/after_data mean for each entity_type. */
export function describe(e: AuditLogEntry): { title: string; from?: string; to?: string; toGood?: boolean; toBad?: boolean; reason?: string; ref?: string } {
  const before = e.before_data ?? {};
  const after = e.after_data ?? {};
  const b = before as Record<string, any>;
  const a = after as Record<string, any>;
  const s = e.subject;
  const name = s?.name ?? null;
  const entry = s?.entry_ref ?? null;

  // Recording a contribution/repayment — the first step, before anyone verifies it.
  if (e.action === 'recorded') {
    const what = e.entity_type === 'loan_payment' ? `a loan repayment${name ? ` from ${name}` : ''}` : `a contribution${name ? ` for ${name}` : ''}`;
    return { title: `Recorded ${what}`, from: '—', to: 'Pending verification' };
  }

  // The Auditor's own actions apply to any entity type, so they're checked before the per-type wording.
  if (e.action === 'flagged') return { title: a.flag ? `Raised flag ${a.flag}${entry ? ` on ${entry}` : name ? ` on ${name}'s record` : ''}` : 'Flagged a posting', to: a.flag ? 'Open' : undefined, toBad: true, reason: a.reason ? [a.reason, a.note].filter(Boolean).join(' — ') : a.note };
  if (e.action === 'proof_requested') return { title: 'Asked for a proof' };

  switch (e.entity_type) {
    case 'contribution':
      return e.action === 'approved'
        ? { title: entry ? `Verified contribution ${entry}` : `Verified ${name ? `${name}'s` : 'a'} contribution`, from: 'Pending', to: 'Verified', toGood: true, ref: a.recorded_by ? 'Recorded by another officer' : undefined }
        : { title: `Returned ${name ? `${name}'s` : 'a'} contribution`, from: 'Pending', to: 'Returned', toBad: true, reason: a.reason };
    case 'expense':
      return e.action === 'approved'
        ? { title: 'Verified an expense', from: 'Recorded', to: `Posted · ${fmtValue(a.amount)}`, toGood: true }
        : { title: 'Returned an expense', from: 'Recorded', to: 'Returned', toBad: true, reason: a.reason };
    case 'loan_decision':
      return e.action === 'approved'
        ? { title: `Approved loan ${s?.loan_ref ?? 'request'}${name ? ` for ${name}` : ''}`, from: 'Requested', to: `Approved · ${fmtValue(a.approved_principal)}`, toGood: true }
        : { title: `Rejected ${name ? `${name}'s` : 'a'} loan request`, from: 'Requested', to: 'Rejected', toBad: true, reason: a.reason };
    case 'loan_disbursement':
      return { title: `Released ${s?.loan_ref ? `loan ${s.loan_ref}` : 'a loan'}${name ? ` to ${name}` : ''}`, from: 'Approved', to: `Active · ${fmtValue(a.principal)}`, toGood: true };
    case 'loan_payment':
      return e.action === 'confirmed'
        ? { title: entry ? `Verified loan repayment ${entry}` : `Verified ${name ? `${name}'s` : 'a'} repayment`, from: 'Pending', to: 'Verified', toGood: true }
        : { title: `Returned ${name ? `${name}'s` : 'a'} repayment`, from: 'Pending', to: 'Returned', toBad: true, reason: a.reason };
    case 'membership_role':
      return { title: 'Changed a member’s role', from: ROLE_LABEL[b.role] ?? b.role ?? 'Member', to: ROLE_LABEL[a.role] ?? a.role };
    case 'membership_heads':
      return { title: 'Changed heads', from: `${b.heads ?? '—'} head${b.heads === 1 ? '' : 's'}`, to: `${a.heads ?? '—'} head${a.heads === 1 ? '' : 's'}` };
    case 'membership_approval':
      return e.action === 'approved'
        ? { title: 'Approved a membership request', from: 'Pending', to: 'Active', toGood: true }
        : { title: 'Rejected a membership request', from: 'Pending', to: 'Rejected', toBad: true, reason: a.reason };
    case 'distribution':
      return e.action === 'verified'
        ? { title: 'Verified the year-end distribution', from: 'Preview', to: `Verified · ${fmtValue(a.total_amount)}`, toGood: true }
        : { title: 'Finalized the year-end distribution', from: 'Verified', to: `Finalized · ${fmtValue(a.total_amount)}`, toGood: true };
    case 'penalty':
      return e.action === 'paid'
        ? { title: 'Collected a late penalty', from: 'Pending', to: `Paid · ${fmtValue(a.amount)}`, toGood: true }
        : { title: 'Waived a penalty', from: 'Pending', to: `Waived · ${fmtValue(a.amount)}`, toGood: true, reason: a.reason };
    case 'reversal_request': {
      const of = entry ? ` of ${entry}` : '';
      const titles: Record<string, string> = {
        initiated: `Started a reversal${of}`,
        verified: `Verified the reversal${of}`,
        rejected: `Rejected the reversal${of}`,
        finalized: s?.reversing_entry_ref ? `Approved reversal ${s.reversing_entry_ref}${of}` : `Approved the reversal${of}`,
      };
      return {
        title: titles[e.action] ?? 'Updated a reversal request',
        from: b.entry_stands ? 'Entry stands' : (b.status ?? 'Pending'),
        to: a.status ? (a.status === 'finalized' ? 'Reversed' : a.status) : 'Updated',
        toGood: e.action === 'verified' || e.action === 'finalized',
        toBad: e.action === 'rejected',
        reason: a.reason ?? a.notes,
      };
    }
    case 'cycle': {
      const titles: Record<string, string> = { created: 'Created a cycle', activated: 'Activated a cycle', closed: 'Closed a cycle' };
      return { title: titles[e.action] ?? 'Updated a cycle', from: b?.status ?? undefined, to: a.status ?? undefined, toGood: e.action !== 'closed' };
    }
    case 'ledger_adjustment':
      return { title: 'Posted a manual adjustment', to: `${a.direction === 'credit' ? '+' : '-'}${fmtValue(a.amount)}`, reason: a.reason };
    case 'group_gcash': {
      const titles: Record<string, string> = { proposed: 'Proposed a GCash number', approved: 'Approved the GCash number', rejected: 'Rejected the GCash number', cancelled: 'Withdrew a GCash number' };
      return { title: titles[e.action] ?? 'Updated the GCash number', to: a.number ?? undefined, toGood: e.action === 'approved', toBad: e.action === 'rejected', reason: a.reason ?? a.note };
    }
    case 'audit_flag':
      return { title: e.action === 'resolved' ? 'Resolved a flag' : e.action === 'dismissed' ? 'Dismissed a flag' : 'Updated a flag', from: 'Open', to: a.status === 'resolved' ? 'Resolved' : a.status === 'dismissed' ? 'Dismissed' : a.status, toGood: e.action === 'resolved', reason: a.note };
    case 'audit_finding': {
      const titles: Record<string, string> = { submitted: 'Submitted an audit finding', resolved: 'Resolved an audit finding', dismissed: 'Dismissed an audit finding' };
      return {
        title: titles[e.action] ?? 'Updated an audit finding',
        from: b.status ?? undefined,
        to: e.action === 'submitted' ? `${a.severity ?? ''} · ${a.title ?? ''}`.trim() : a.status ?? undefined,
        toGood: e.action === 'resolved',
        toBad: e.action === 'submitted',
        reason: a.note,
      };
    }
    case 'announcement':
      return { title: 'Posted an announcement' };
    case 'payment_reminder':
      return { title: 'Sent a payment reminder' };
    default:
      return { title: e.action.replace(/_/g, ' ') };
  }
}
