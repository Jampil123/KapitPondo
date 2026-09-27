// packages/shared/src/enums.ts
// Canonical status vocabularies and role names — used by mobile, admin, and (mirrored in) the backend.

export const MembershipRole = {
  OWNER: 'owner',
  TREASURER: 'treasurer',
  AUDITOR: 'auditor',
  MEMBER: 'member',
} as const;
export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

export const VerificationStatus = {
  UNVERIFIED: 'unverified',
  PENDING: 'pending',
  VERIFIED: 'verified',
  RESUBMISSION_REQUIRED: 'resubmission_required',
  REJECTED: 'rejected',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const MembershipStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  EXITED: 'exited',
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const CycleStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;
export type CycleStatus = (typeof CycleStatus)[keyof typeof CycleStatus];

export const ContributionStatus = {
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type ContributionStatus = (typeof ContributionStatus)[keyof typeof ContributionStatus];

export const LoanStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  ACTIVE: 'active',
  PAID: 'paid',
  REJECTED: 'rejected',
  DEFAULTED: 'defaulted',
} as const;
export type LoanStatus = (typeof LoanStatus)[keyof typeof LoanStatus];

export const DistributionStatus = {
  DRAFT: 'draft',
  PREVIEWED: 'previewed',
  FINALIZED: 'finalized',
} as const;
export type DistributionStatus = (typeof DistributionStatus)[keyof typeof DistributionStatus];

export const PaymentMethod = {
  GCASH: 'gcash',
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  OTHER: 'other',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

// Role helpers
export const isOfficer = (role: MembershipRole) =>
  role === MembershipRole.OWNER ||
  role === MembershipRole.TREASURER ||
  role === MembershipRole.AUDITOR;