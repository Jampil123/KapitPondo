/**
 * apps/admin/src/components/ui/ErrorBanner.tsx — inline red message box
 * used for form-level errors (e.g. failed sign-in).
 */
import type { ReactNode } from 'react';

export function ErrorBanner({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{children}</div>;
}
