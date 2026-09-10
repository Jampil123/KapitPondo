/**
 * constants/sex.ts
 * ----------------------------------------------------------------------------
 * Sex as printed on a PH government ID — the identity wizard's step 3
 * (Personal Information) offers this as a picker, same pattern as ID_TYPES.
 */
export type SexOption = { label: string; value: string };

export const SEX_OPTIONS: SexOption[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];

export function sexLabel(value?: string | null): string {
  return SEX_OPTIONS.find((s) => s.value === value)?.label ?? '—';
}
