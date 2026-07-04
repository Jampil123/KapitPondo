/**
 * constants/idTypes.ts
 * ----------------------------------------------------------------------------
 * Government ID options offered on the identity-verification wizard's step 1.
 */
export type IdTypeOption = { label: string; value: string };

export const ID_TYPES: IdTypeOption[] = [
  { label: 'Philippine Passport', value: 'passport' },
  { label: "Driver's License", value: 'drivers_license' },
  { label: 'UMID', value: 'umid' },
  { label: 'PhilSys National ID', value: 'philsys' },
  { label: 'PRC ID', value: 'prc' },
  { label: "Voter's ID", value: 'voters_id' },
  { label: 'Postal ID', value: 'postal_id' },
  { label: 'SSS ID', value: 'sss' },
  { label: 'GSIS eCard', value: 'gsis' },
];

export function idTypeLabel(value?: string | null): string {
  return ID_TYPES.find((t) => t.value === value)?.label ?? 'Unknown ID type';
}
