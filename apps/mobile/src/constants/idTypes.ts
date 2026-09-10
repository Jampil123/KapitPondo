export type IdTypeOption = { label: string; value: string };

export const ID_TYPES: IdTypeOption[] = [
  { label: 'Philippine Passport', value: 'passport' },
  { label: "Driver's License", value: 'drivers_license' },
  { label: 'UMID', value: 'umid' },
  { label: 'PhilSys National ID', value: 'philsys' },
  { label: 'SSS ID', value: 'sss' },
];

export function idTypeLabel(value?: string | null): string {
  return ID_TYPES.find((t) => t.value === value)?.label ?? 'Unknown ID type';
}
