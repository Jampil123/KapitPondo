/**
 * apps/admin/src/components/layout/SidebarControl.tsx — sidebar-header
 * button that opens a "Sidebar control" popover (Expanded / Collapsed /
 * Expand on hover). The popover is portaled to <body> so it escapes the
 * sidebar's overflow clipping and sticky stacking context. Closes on
 * outside click or Escape.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeft } from 'lucide-react';

export type SidebarMode = 'expanded' | 'collapsed' | 'hover';

const OPTIONS: { value: SidebarMode; label: string }[] = [
  { value: 'expanded', label: 'Expanded' },
  { value: 'collapsed', label: 'Collapsed' },
  { value: 'hover', label: 'Expand on hover' },
];

type SidebarControlProps = {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  // Lets the sidebar stay expanded (in hover mode) while the popover is open.
  onOpenChange: (open: boolean) => void;
};

export function SidebarControl({ mode, onModeChange, onOpenChange }: SidebarControlProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  function setOpen(next: boolean) {
    if (next && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ left: r.right + 8, top: r.top });
    } else {
      setPos(null);
    }
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setPos(null);
      onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPos(null); onOpenChange(false); }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white ${open ? 'bg-white/10 text-white' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Sidebar control"
      >
        <PanelLeft size={18} />
      </button>

      {pos ? createPortal(
        <div
          ref={popoverRef}
          role="menu"
          className="fixed z-50 w-52 rounded-xl bg-surface border border-line shadow-lg overflow-hidden"
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="px-4 py-2.5 text-[13px] text-muted border-b border-line">Sidebar control</div>
          <div className="py-1.5">
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                role="menuitemradio"
                aria-checked={mode === o.value}
                onClick={() => { onModeChange(o.value); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-surface-alt"
              >
                <span className="w-3 flex justify-center">
                  {mode === o.value ? <span className="w-1.5 h-1.5 rounded-full bg-ink" /> : null}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
