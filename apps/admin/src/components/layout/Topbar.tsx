/**
 * apps/admin/src/components/layout/Topbar.tsx — page title/subtitle, search
 * box, notification bell, and the account dropdown.
 */
import { Search, Bell } from 'lucide-react';
import type { AdminMe } from '../../context/AdminAuthContext';
import { AccountMenu } from './AccountMenu';

type TopbarProps = {
  title: string;
  subtitle: string;
  admin: AdminMe | null;
  onSignOut: () => void | Promise<void>;
};

export function Topbar({ title, subtitle, admin, onSignOut }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-5 h-[70px] px-7 bg-surface border-b border-line">
      <div className="shrink-0 leading-tight">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="text-[13px] text-muted">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2.5 flex-1 max-w-[380px] bg-surface-alt rounded-xl px-3.5 py-2.5">
        <Search size={18} className="text-muted shrink-0" />
        <input
          placeholder="Search users, groups, activity…"
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted outline-none"
        />
      </div>

      <div className="flex-1" />

      <button className="relative p-1.5 text-muted hover:text-ink" aria-label="Notifications">
        <Bell size={21} />
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger border-2 border-surface" />
      </button>

      <AccountMenu admin={admin} onSignOut={onSignOut} />
    </header>
  );
}
