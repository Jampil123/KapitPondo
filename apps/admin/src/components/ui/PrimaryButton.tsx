/**
 * apps/admin/src/components/ui/PrimaryButton.tsx — the dark full-width submit
 * button used on LoginPage, with a busy/loading label swap.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  busyLabel?: ReactNode;
  children: ReactNode;
};

export function PrimaryButton({ busy, busyLabel, children, disabled, ...rest }: PrimaryButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled ?? busy}
      className="w-full rounded-xl bg-ink py-4 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60 shadow-lg"
    >
      {busy ? (busyLabel ?? children) : children}
    </button>
  );
}
