/**
 * apps/admin/src/components/ui/TextField.tsx — icon + input wrapper used by
 * LoginPage's email/password fields (and any future form needing the same shape).
 */
import type { ComponentType, InputHTMLAttributes, ReactNode } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  icon: ComponentType<{ size?: number; className?: string }>;
  endAdornment?: ReactNode;
};

export function TextField({ icon: Icon, endAdornment, className, ...input }: TextFieldProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-alt px-3.5 py-3 focus-within:ring-2 focus-within:ring-brand">
      <Icon size={18} className="text-muted" />
      <input {...input} className={`flex-1 bg-transparent text-sm text-ink outline-none ${className ?? ''}`} />
      {endAdornment}
    </div>
  );
}
