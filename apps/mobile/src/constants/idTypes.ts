import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/api/system';

export type IdTypeOption = { label: string; value: string };

// Built-in list — used until (or if) System Configuration answers.
export const ID_TYPES: IdTypeOption[] = [
  { label: 'Philippine Passport', value: 'passport' },
  { label: "Driver's License", value: 'drivers_license' },
  { label: 'UMID', value: 'umid' },
  { label: 'PhilSys National ID', value: 'philsys' },
  { label: 'SSS ID', value: 'sss' },
];

// Labels for ID types an administrator added in System Configuration, so
// idTypeLabel() can name them too.
const configuredLabels = new Map<string, string>();

export function idTypeLabel(value?: string | null): string {
  if (!value) return 'Unknown ID type';
  return configuredLabels.get(value) ?? ID_TYPES.find((t) => t.value === value)?.label ?? 'Unknown ID type';
}

/** The ID types the System Administrator currently accepts (falls back to ID_TYPES). */
export function useAcceptedIdTypes(): IdTypeOption[] {
  const [types, setTypes] = useState<IdTypeOption[]>(ID_TYPES);
  useEffect(() => {
    let alive = true;
    getSystemConfig()
      .then((c) => {
        const list = c.verification.accepted_id_types;
        list.forEach((t) => configuredLabels.set(t.value, t.label));
        if (alive && list.length) setTypes(list);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return types;
}
