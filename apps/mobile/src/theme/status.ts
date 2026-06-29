/**
 * theme/status.ts
 * ----------------------------------------------------------------------------
 * The signature of KapitPondo's design system: every status from the system
 * spec's state machines is mapped to a semantic intent + a human label. The UI
 * is entirely status-driven, so this file is what makes status pills, badges,
 * and row accents consistent everywhere.
 *
 * Enum values mirror packages/shared enums.ts exactly. If you add a DB enum
 * value, add it here too — TypeScript will flag any screen that forgot it.
 */
import type { IntentName } from './colors';

export type StatusMeta = { intent: IntentName; label: string };

// M1 — account identity verification (member_verification_status)
export const verificationStatus: Record<string, StatusMeta> = {
  unverified: { intent: 'neutral', label: 'Unverified' },
  pending:    { intent: 'warning', label: 'Pending' },
  verified:   { intent: 'success', label: 'Verified' },
  rejected:   { intent: 'danger',  label: 'Rejected' },
};

// M3 — membership_status
export const membershipStatus: Record<string, StatusMeta> = {
  pending:   { intent: 'warning', label: 'Pending' },
  active:    { intent: 'success', label: 'Active' },
  suspended: { intent: 'danger',  label: 'Suspended' },
  exited:    { intent: 'neutral', label: 'Exited' },
};

// Role accents (per-group). Owner/Treasurer/Auditor get brand-leaning colors;
// plain member stays neutral.
export const membershipRole: Record<string, StatusMeta> = {
  owner:     { intent: 'primary', label: 'Owner' },
  treasurer: { intent: 'info',    label: 'Treasurer' },
  auditor:   { intent: 'accent',  label: 'Auditor' },
  member:    { intent: 'neutral', label: 'Member' },
};

// M4 — cycle_status
export const cycleStatus: Record<string, StatusMeta> = {
  draft:  { intent: 'neutral', label: 'Draft' },
  active: { intent: 'success', label: 'Active' },
  closed: { intent: 'neutral', label: 'Closed' },
};

// M5 — contribution_status (+ is_late flag handled separately below)
export const contributionStatus: Record<string, StatusMeta> = {
  pending:   { intent: 'warning', label: 'Due' },
  submitted: { intent: 'info',    label: 'Submitted' },
  approved:  { intent: 'success', label: 'Approved' },
  rejected:  { intent: 'danger',  label: 'Rejected' },
};
export const lateFlag: StatusMeta = { intent: 'danger', label: 'Late' };

// M6 — loan_status
export const loanStatus: Record<string, StatusMeta> = {
  pending:   { intent: 'warning', label: 'Requested' },
  approved:  { intent: 'info',    label: 'Approved' },
  active:    { intent: 'primary', label: 'Active' },
  paid:      { intent: 'success', label: 'Settled' },
  rejected:  { intent: 'danger',  label: 'Rejected' },
  defaulted: { intent: 'danger',  label: 'Defaulted' },
};

// M6 — loan_payment_status
export const loanPaymentStatus: Record<string, StatusMeta> = {
  scheduled: { intent: 'neutral', label: 'Scheduled' },
  submitted: { intent: 'info',    label: 'Submitted' },
  approved:  { intent: 'success', label: 'Approved' },
  paid:      { intent: 'success', label: 'Paid' },
  late:      { intent: 'danger',  label: 'Late' },
  partial:   { intent: 'warning', label: 'Partial' },
};

// M9 — distribution_status
export const distributionStatus: Record<string, StatusMeta> = {
  draft:     { intent: 'neutral', label: 'Draft' },
  previewed: { intent: 'info',    label: 'Preview' },
  finalized: { intent: 'success', label: 'Finalized' },
};

// M7 — expense_status
export const expenseStatus: Record<string, StatusMeta> = {
  submitted: { intent: 'info',    label: 'Submitted' },
  approved:  { intent: 'success', label: 'Approved' },
  rejected:  { intent: 'danger',  label: 'Rejected' },
};

/**
 * Single lookup used by <StatusBadge entity="contribution" value={...} />.
 * Falls back to a neutral "Unknown" so an unmapped value never crashes a row.
 */
export const statusRegistry = {
  verification: verificationStatus,
  membership: membershipStatus,
  role: membershipRole,
  cycle: cycleStatus,
  contribution: contributionStatus,
  loan: loanStatus,
  loanPayment: loanPaymentStatus,
  distribution: distributionStatus,
  expense: expenseStatus,
} as const;

export type StatusEntity = keyof typeof statusRegistry;

export function getStatusMeta(entity: StatusEntity, value?: string | null): StatusMeta {
  const table = statusRegistry[entity] as Record<string, StatusMeta>;
  return (value && table[value]) || { intent: 'neutral', label: value ?? 'Unknown' };
}