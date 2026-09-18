import { api } from './client';

export interface RecordContribution {
  id: string;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: string;
  is_late: boolean;
  penalty_applied: number;
  external_reference: string | null;
  created_at: string;
}

export interface RecordLoanPayment {
  id: string;
  amount: number;
  interest_portion: number;
  principal_portion: number;
  paid_date: string | null;
  status: string;
  external_reference: string | null;
}

export interface RecordLoan {
  id: string;
  principal: number;
  approved_principal: number | null;
  interest_rate: number | null;
  term_months: number | null;
  purpose: string | null;
  status: string;
  outstanding_balance: number;
  applied_at: string;
  disbursed_at: string | null;
  disbursed_ledger_entry_id: string | null;
  approver?: { full_name: string } | null;
  disburser?: { full_name: string } | null;
  payments: RecordLoanPayment[];
}

export interface MemberRecordGroup {
  group: { name: string; fund_code: string };
  membership: { role: string; status: string; heads: number; joined_at: string | null };
  cycle: {
    name: string;
    status: string;
    start_date: string;
    end_date: string;
    contribution_amount: number;
    contribution_due_day: number | null;
    default_interest_rate: number | null;
  } | null;
  contributions: RecordContribution[];
  contributionTotals: { total_paid: number; late_count: number; penalty_applied: number };
  loans: RecordLoan[];
  penaltyTotals: { charged: number; waived: number };
  ledgerSummary: { total_capital_contributed: number; outstanding_loan_balance: number };
  distribution: {
    period: string;
    status: string;
    allocation: { amount: number } | null;
  } | null;
}

export interface MemberRecordResponse {
  member: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    verification_status: string;
    created_at: string;
  };
  generated_at: string;
  reference: string;
  groups: MemberRecordGroup[];
}

export async function getMyRecords(): Promise<MemberRecordResponse> {
  return api.get<MemberRecordResponse>('/api/me/records');
}
