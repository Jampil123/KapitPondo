/**
 * apps/admin/src/components/layout/AccountMenu.tsx — sidebar-footer
 * avatar/name with an upward dropdown (Profile & Settings, Sign out). Collapses to
 * just the avatar when the sidebar is collapsed. Closes on outside click.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, LogOut, UserRound } from 'lucide-react';
import type { AdminMe } from '../../context/AdminAuthContext';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';

type AccountMenuProps = {
  admin: AdminMe | null;
  onSignOut: () => void | Promise<void>;
  expanded: boolean;
  showTooltip: boolean;
  // Lets the sidebar stay expanded while the menu is open.
  onOpenChange: (open: boolean) => void;
};

export function AccountMenu({ admin, onSignOut, expanded, showTooltip, onOpenChange }: AccountMenuProps) {
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
            <UserRound size={16} />
            Profile & Settings
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

      <Tooltip label={admin?.full_name || admin?.email || 'Account'} disabled={!showTooltip}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`w-full flex items-center rounded-xl py-2.5 hover:bg-white/5 ${expanded ? 'gap-3 px-3.5' : 'justify-center px-0'}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Avatar name={admin?.full_name} email={admin?.email} url={admin?.avatar_url} size={36} />
          {expanded ? (
            <>
              <div className="min-w-0 flex-1 text-left whitespace-nowrap">
                <div className="text-[13px] font-semibold text-white truncate">{admin?.full_name || 'Admin User'}</div>
                <div className="text-[11px] text-white/50 truncate">{admin?.email ?? admin?.user_id}</div>
              </div>
              <ChevronUp size={16} className={`text-white/50 shrink-0 transition-transform ${menuOpen ? '' : 'rotate-180'}`} />
            </>
          ) : null}
        </button>
      </Tooltip>
    </div>
  );
}
