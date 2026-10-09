/**
 * apps/admin/src/components/ui/Dialog.tsx — centered modal card with a
 * blurred backdrop. Portaled to <body>; closes on backdrop click, Escape or ✕.
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function Dialog({ open, onClose, icon: Icon, title, subtitle, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title}
           className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl px-7 py-7">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-muted hover:text-ink">
          <X size={20} />
        </button>
        <div className="flex items-center gap-3 mb-5 pr-6">
          {Icon ? (
            <div className="w-10 h-10 rounded-xl bg-surface-alt flex items-center justify-center shrink-0">
              <Icon size={18} className="text-brand-dark" />
            </div>
          ) : null}
          <div>
            <div className="text-lg font-semibold text-ink leading-tight">{title}</div>
            {subtitle ? <div className="text-xs text-muted">{subtitle}</div> : null}
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
