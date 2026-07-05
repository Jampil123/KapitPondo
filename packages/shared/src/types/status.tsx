/**
 * packages/shared/src/types/status.ts
 * ----------------------------------------------------------------------------
 * The canonical status vocabularies (spec §0.3) and role types, shared by
 * mobile + admin so both label and color statuses identically.
 */

// ---- Account / identity (what the Sysadmin acts on) ----
export type AccountStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

// ---- Group-side vocabularies ----
export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'withdrawn' | 'rejected';
export type CycleStatus = 'draft' | 'active' | 'finalizing' | 'closed';
export type ContributionStatus = 'due' | 'submitted' | 'approved' | 'rejected';
export type LoanStatus = 'pending' | 'approved' | 'active' | 'paid' | 'rejected' | 'defaulted';
export type ExpenseStatus = 'submitted' | 'approved' | 'rejected';
export type DistributionStatus = 'draft' | 'previewed' | 'finalized';

// ---- Roles ----
export type GroupRole = 'owner' | 'treasurer' | 'auditor' | 'member';
export type PlatformRole = 'sysadmin';

// ---- Intents (for badges) ----
export type Intent = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; intent: Intent }> = {
  unverified: { label: 'Unverified', intent: 'neutral' },
  pending: { label: 'Pending', intent: 'warning' },
  verified: { label: 'Verified', intent: 'success' },
  rejected: { label: 'Rejected', intent: 'danger' },
};

export const ROLE_LABEL: Record<GroupRole, string> = {
  owner: 'Organizer',
  treasurer: 'Treasurer',
  auditor: 'Auditor',
  member: 'Member',
};