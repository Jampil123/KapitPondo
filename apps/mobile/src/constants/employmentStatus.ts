/**
 * constants/employmentStatus.ts
 * ----------------------------------------------------------------------------
 * Employment-status options offered on the identity-verification wizard's
 * Personal Information step.
 */
export type EmploymentStatusOption = { label: string; value: string };

export const EMPLOYMENT_STATUSES: EmploymentStatusOption[] = [
  { label: 'Employed', value: 'employed' },
  { label: 'Self-Employed', value: 'self_employed' },
  { label: 'Business Owner', value: 'business_owner' },
  { label: 'Student', value: 'student' },
  { label: 'Unemployed', value: 'unemployed' },
  { label: 'Retired', value: 'retired' },
];

export function employmentStatusLabel(value?: string | null): string {
  return EMPLOYMENT_STATUSES.find((t) => t.value === value)?.label ?? 'Not specified';
}
