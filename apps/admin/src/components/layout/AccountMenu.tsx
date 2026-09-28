/**
 * apps/admin/src/components/layout/AccountMenu.tsx — sidebar-footer
 * avatar/name with an upward dropdown (Settings, Sign out). Collapses to
 * just the avatar when the sidebar is collapsed. Closes on outside click.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, LogOut, Settings } from 'lucide-react';
import type { AdminMe } from '../../context/AdminAuthContext';

type AccountMenuProps = {
  admin: AdminMe | null;
  onSignOut: () => void | Promise<void>;
  expanded: boolean;
  // Lets the sidebar stay expanded while the menu is open.
  onOpenChange: (open: boolean) => void;
};

export function AccountMenu({ admin, onSignOut, expanded, onOpenChange }: AccountMenuProps) {
  const [menuOpen, setMenuOpenState] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  function setMenuOpen(open: boolean) {
    setMenuOpenState(open);
    onOpenChange(open);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenState(false);
        onOpenChange(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen, onOpenChange]);

  return (
    <div className="relative" ref={menuRef}>
      {menuOpen ? (
        <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl bg-surface border border-line shadow-lg overflow-hidden z-20">
          <button
            onClick={() => { setMenuOpen(false); nav('/settings'); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-ink hover:bg-surface-alt"
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            onClick={async () => { setMenuOpen(false); await onSignOut(); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-danger hover:bg-danger-bg border-t border-line"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      ) : null}

      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className={`w-full flex items-center rounded-xl py-2.5 hover:bg-white/5 ${expanded ? 'gap-3 px-3.5' : 'justify-center px-0'}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={expanded ? undefined : admin?.email ?? 'Account'}
      >
        <div className="w-9 h-9 rounded-lg bg-brand text-white flex items-center justify-center text-sm font-semibold shrink-0">
          {(admin?.email ?? 'A').slice(0, 1).toUpperCase()}
        </div>
        {expanded ? (
          <>
            <div className="min-w-0 flex-1 text-left whitespace-nowrap">
              <div className="text-[13px] font-semibold text-white truncate">Admin User</div>
              <div className="text-[11px] text-white/50 truncate">{admin?.email ?? admin?.user_id}</div>
            </div>
            <ChevronUp size={16} className={`text-white/50 shrink-0 transition-transform ${menuOpen ? '' : 'rotate-180'}`} />
          </>
        ) : null}
      </button>
    </div>
  );
}
