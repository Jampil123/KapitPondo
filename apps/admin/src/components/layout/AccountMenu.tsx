/**
 * apps/admin/src/components/layout/AccountMenu.tsx — topbar avatar/name
 * dropdown with the "Sign out" action. Closes on outside click.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import type { AdminMe } from '../../context/AdminAuthContext';

export function AccountMenu({ admin, onSignOut }: { admin: AdminMe | null; onSignOut: () => void | Promise<void> }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="relative pl-4 border-l border-line" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2.5"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <div className="w-9 h-9 rounded-lg bg-brand text-white flex items-center justify-center text-sm font-semibold shrink-0">
          {(admin?.email ?? 'A').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 text-left">
          <div className="text-[13px] font-semibold text-ink truncate max-w-[150px]">Admin User</div>
          <div className="text-[11px] text-muted truncate max-w-[150px]">{admin?.email ?? admin?.user_id}</div>
        </div>
        <ChevronDown size={16} className={`text-muted shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-surface border border-line shadow-lg overflow-hidden z-20">
          <button
            onClick={async () => { setMenuOpen(false); await onSignOut(); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-danger hover:bg-danger-bg"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
