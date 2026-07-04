/**
 * constants/sourceOfFunds.ts
 * ----------------------------------------------------------------------------
 * Source-of-funds options offered on the identity-verification wizard's
 * Personal Information step.
 */
export type SourceOfFundsOption = { label: string; value: string };

export const SOURCE_OF_FUNDS: SourceOfFundsOption[] = [
  { label: 'Salary', value: 'salary' },
  { label: 'Business Income', value: 'business_income' },
  { label: 'Remittance / Allowance', value: 'remittance_allowance' },
  { label: 'Savings / Investments', value: 'savings_investments' },
  { label: 'Other', value: 'other' },
];

export function sourceOfFundsLabel(value?: string | null): string {
  return SOURCE_OF_FUNDS.find((t) => t.value === value)?.label ?? 'Not specified';
}
