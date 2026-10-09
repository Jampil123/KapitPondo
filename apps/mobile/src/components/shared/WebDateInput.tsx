import { createElement } from 'react';
import { semantic, intent } from '../../theme/colors';

/** Web only: a real <input type="date"> so browsers show their calendar picker. Value is "YYYY-MM-DD" or "". */
export function WebDateInput({ value, onChange, min, max, invalid, height = 48 }: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  invalid?: boolean;
  height?: number;
}) {
  return createElement('input', {
    type: 'date',
    value,
    min,
    max,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      height,
      padding: '0 14px',
      borderRadius: 12,
      border: invalid ? `1.5px solid ${intent.danger.base}` : 'none',
      outline: 'none',
      backgroundColor: semantic.surfaceAlt,
      color: value ? semantic.textPrimary : semantic.textMuted,
      fontFamily: 'Poppins_400Regular',
      fontSize: 14,
      colorScheme: 'light',
    },
  });
}
