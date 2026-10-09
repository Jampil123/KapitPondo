/**
 * apps/admin/src/components/ui/Tooltip.tsx — hover label shown to the right
 * of its child. Portaled to <body> so it escapes the sidebar's overflow
 * clipping and sticky stacking context. Pass disabled to render the child only.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type TooltipProps = { label: string; disabled?: boolean; children: ReactNode };

export function Tooltip({ label, disabled, children }: TooltipProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  if (disabled) {
    if (pos) setPos(null); // don't resurface a stale label when re-enabled
    return <>{children}</>;
  }

  return (
    <div
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ left: r.right + 10, top: r.top + r.height / 2 });
      }}
      onMouseLeave={() => setPos(null)}
      onMouseDown={() => setPos(null)}
    >
      {children}
      {pos ? createPortal(
        <div
          role="tooltip"
          className="fixed z-50 -translate-y-1/2 pointer-events-none whitespace-nowrap rounded-lg bg-ink text-surface text-xs font-medium px-2.5 py-1.5 shadow-lg"
          style={{ left: pos.left, top: pos.top }}
        >
          {label}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
