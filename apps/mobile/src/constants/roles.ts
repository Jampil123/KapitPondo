/**
 * constants/roles.ts
 * ============================================================================
 * The single source of truth for "which roles can do what" on the CLIENT.
 *
 * IMPORTANT: these lists mirror the API's `requireGroupRole([...])` guards as
 * they are actually enforced today — NOT the spec's §1.1 matrix. The two differ
 * in a few places (flagged with SPEC-DIVERGENCE below). UI must follow the real
 * guards so a button never appears that the API would then reject with 403.
 *
 * If/when you tighten the backend to match the spec matrix, update the lists
 * here in the same change so UI and API stay in lockstep.
 * ============================================================================
 */

export type GroupRole = 'owner' | 'treasurer' | 'auditor' | 'member';

export const ALL_ROLES: GroupRole[] = ['owner', 'treasurer', 'auditor', 'member'];
export const OFFICER_ROLES: GroupRole[] = ['owner', 'treasurer', 'auditor'];

export type Capability =
  // membership
  | 'viewMembers'
  | 'approveMembership'        // SPEC-DIVERGENCE: §1.1 = Owner only; API allows treasurer
  | 'setMemberRole'
  | 'removeMember'
  | 'setHeads'
  // cycles
  | 'manageCycle'
  // contributions
  | 'submitContribution'
  | 'approveContribution'      // SPEC-DIVERGENCE: §1.1 reserves approval to Auditor; API allows all officers
  // lending
  | 'applyLoan'
  | 'approveLoan'              // approve+disburse fused; SPEC §1.2 wanted Owner-authorize vs Treasurer-disburse
  | 'recordRepayment'
  | 'viewLiquidity'
  // expenses
  | 'recordExpense'
  | 'approveExpense'
  // ledger
  | 'reverseLedger'
  | 'postAdjustment'
  // distribution
  | 'previewDistribution'
  | 'finalizeDistribution'
  | 'cancelDistribution'
  // reporting
  | 'viewReports'
  | 'viewFundSummary'
  // groups
  | 'viewOfficers';

/** capability → roles permitted by the live API guards. */
export const CAPABILITY_ROLES: Record<Capability, GroupRole[]> = {
  viewMembers: ['owner', 'treasurer', 'auditor'],
  approveMembership: ['owner', 'treasurer'],
  setMemberRole: ['owner'],
  removeMember: ['owner'],
  setHeads: ['owner'],

  manageCycle: ['owner', 'treasurer'],

  submitContribution: ALL_ROLES,
  approveContribution: ['owner', 'treasurer', 'auditor'],

  applyLoan: ALL_ROLES,
  approveLoan: ['owner', 'treasurer'],
  recordRepayment: ['owner', 'treasurer'],
  viewLiquidity: ['owner', 'treasurer', 'auditor'],

  recordExpense: ['owner', 'treasurer'],
  approveExpense: ['owner', 'auditor'],

  reverseLedger: ['owner'],
  postAdjustment: ['owner', 'treasurer'],

  previewDistribution: ['owner', 'treasurer'],
  finalizeDistribution: ['owner'],
  cancelDistribution: ['owner', 'treasurer'],

  viewReports: ['owner', 'treasurer', 'auditor'],
  viewFundSummary: ALL_ROLES,
  viewOfficers: ALL_ROLES,
};

/** Does this role have this capability? Use this to gate buttons/screens. */
export function can(role: GroupRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITY_ROLES[capability].includes(role);
}

export function isOfficer(role: GroupRole | null | undefined): boolean {
  return !!role && OFFICER_ROLES.includes(role);
}