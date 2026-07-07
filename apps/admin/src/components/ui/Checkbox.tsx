/**
 * apps/admin/src/components/ui/Checkbox.tsx — "Remember me"-style toggle
 * used on LoginPage; a plain button + custom checkmark, not a native <input>.
 */

type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
};

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2.5 text-sm text-secondary">
      <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${checked ? 'bg-ink border-ink' : 'border-line-strong'}`}>
        {checked && <CheckIcon />}
      </span>
      {label}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
