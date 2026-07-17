/**
 * apps/admin/src/components/layout/Topbar.tsx — page title/subtitle,
 * notification bell, and the account dropdown. (Search lives on the
 * Dashboard page itself — see features/overview/OverviewPage.tsx.)
 */
import { Bell, Menu } from 'lucide-react';
import type { AdminMe } from '../../context/AdminAuthContext';
import { AccountMenu } from './AccountMenu';

type TopbarProps = {
  title: string;
  subtitle: string;
  admin: AdminMe | null;
  onSignOut: () => void | Promise<void>;
  onMenuClick: () => void;
};

export function Topbar({ title, subtitle, admin, onSignOut, onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-5 h-[80px] px-7 bg-surface border-b border-line">
      <button onClick={onMenuClick} className="shrink-0 p-1.5 text-muted hover:text-ink" aria-label="Toggle sidebar">
        <Menu size={22} />
      </button>

      <div className="shrink-0 leading-tight">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="text-[13px] text-muted">{subtitle}</p>
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
