/**
 * apps/admin/src/components/layout/Topbar.tsx — page title/subtitle and the
 * notification bell. (The account menu lives in the sidebar footer; search
 * lives on the Dashboard page itself — see features/overview/OverviewPage.tsx.)
 */
import type { AdminMe } from '../../context/AdminAuthContext';
import { NotificationBell } from './NotificationBell';

type TopbarProps = {
  title: string;
  subtitle: string;
  admin: AdminMe | null;
};

export function Topbar({ title, subtitle, admin }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-5 h-[80px] px-7 bg-surface-alt/80 backdrop-blur-md border-b border-line">
      <div className="shrink-0 leading-tight">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="text-[13px] text-muted">{subtitle}</p>
      </div>

      <div className="flex-1" />

      <NotificationBell memberId={admin?.user_id} />
    </header>
  );
}
