// packages/shared/src/types.ts
// TypeScript shapes for the core tables. Mirror of the database schema.

import type {
  MembershipRole, VerificationStatus, MembershipStatus, CycleStatus,
  ContributionStatus, LoanStatus, DistributionStatus, PaymentMethod,
} from './enums';

export interface Member {
  id: string;
  auth_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_system_admin: boolean;
  verification_status: VerificationStatus;
  verification_rejection_reason: string | null;
  id_document_url: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  fund_code: string;
  description: string | null;
  owner_id: string;
  status: 'active' | 'archived';
  created_at: string;
}

export interface Membership {
  id: string;
  member_id: string;
  group_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  heads: number;
  joined_at: string | null;
  created_at: string;
}

export interface Cycle {
  id: string;
  group_id: string;
  name: string;
  contribution_amount: number;
  frequency: string;
  penalty_amount: number;
  penalty_type: string;
  start_date: string;
  end_date: string | null;
  status: CycleStatus;
}

export interface Contribution {
  id: string;
  membership_id: string;
  cycle_id: string;
  group_id: string;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  is_late: boolean;
  status: ContributionStatus;
  payment_method: PaymentMethod | null;
  proof_url: string | null;
  external_reference: string | null;
  created_at: string;
}

export interface Loan {
  id: string;
  membership_id: string;
  group_id: string;
  principal: number;
  interest_rate: number;
  term_months: number;
  purpose: string | null;
  status: LoanStatus;
  outstanding_balance: number;
  applied_at: string;
  created_at: string;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  amount: number;
  principal_portion: number;
  interest_portion: number;
  due_date: string | null;
  paid_date: string | null;
  status: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  group_id: string;
  membership_id: string | null;
  cycle_id: string | null;
  entry_type: string;
  direction: 'credit' | 'debit';
  amount: number;
  source_type: string | null;
  source_id: string | null;
  description: string | null;
  posted_at: string;
}

export interface Distribution {
  id: string;
  group_id: string;
  cycle_id: string | null;
  period: string;
  total_amount: number;
  rate: number | null;
  status: DistributionStatus;
  finalized_at: string | null;
  created_at: string;
}

export interface DistributionAllocation {
  id: string;
  distribution_id: string;
  membership_id: string;
  amount: number;
  ledger_entry_id: string | null;
}