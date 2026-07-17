/**
 * apps/admin/src/components/layout/Sidebar.tsx — dark sidebar shell, grouped
 * into HOME (Dashboard · Users · Groups · Activity) and SYSTEM HEALTH
 * (Database · Auth Service · Storage · Background Jobs), with a pending
 * badge on Users (from /admin/verifications?status=pending).
 *
 * Collapsed by default (icons only) to leave more room for the main
 * content. Expands to show labels when pinned open via the Topbar's
 * hamburger button, or while the pointer is hovering over it. Stays in
 * the normal document flow (not an overlay) and sticks in place while
 * the main content scrolls.
 */
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Users, Boxes, Activity, Database, Shield, HardDrive, Cog } from 'lucide-react';
import kapitlogo from '../../assets/images/KapitLogo.png';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; badgeKey?: 'pending_verifications' };

const HOME_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/verifications', label: 'Users', icon: Users, badgeKey: 'pending_verifications' },
  { to: '/groups', label: 'Groups', icon: Boxes },
  { to: '/audit', label: 'Activity', icon: Activity },
];

const SYSTEM_HEALTH_NAV: NavItem[] = [
  { to: '/system/database', label: 'Database', icon: Database },
  { to: '/system/auth-service', label: 'Auth Service', icon: Shield },
  { to: '/system/storage', label: 'Storage', icon: HardDrive },
  { to: '/system/background-jobs', label: 'Background Jobs', icon: Cog },
];

function NavSection({ title, items, pending, expanded }: {
  title: string;
  items: NavItem[];
  pending: number | null;
  expanded: boolean;
}) {
  return (
    <div className="mb-5">
      {expanded ? (
        <div className="px-3.5 mb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase whitespace-nowrap">{title}</div>
      ) : (
        <div className="h-2" />
      )}
      <div className="space-y-1.5">
        {items.map((n) => {
          const badge = n.badgeKey === 'pending_verifications' ? pending : null;
          return (
            <NavLink key={n.to} to={n.to} end={n.end} title={expanded ? undefined : n.label}
              className={({ isActive }) =>
                `flex items-center rounded-xl py-3 text-sm transition-colors ${expanded ? 'gap-3 px-3.5' : 'justify-center px-0'} ${
                  isActive ? 'bg-brand text-white font-semibold' : 'text-white/60 hover:bg-white/5'
                }`
              }>
              {({ isActive }) => (
                <>
                  <span className="relative shrink-0 flex items-center justify-center">
                    <n.icon size={20} color={isActive ? '#fff' : 'rgba(255, 255, 255, 0.62)'} />
                    {!expanded && badge ? (
                      <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-[#2A3E4B]" />
                    ) : null}
                  </span>
                  {expanded ? (
                    <>
                      <span className="flex-1 whitespace-nowrap">{n.label}</span>
                      {badge ? (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center justify-center">
                          {badge}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({ pending, pinned }: { pending: number | null; pinned: boolean }) {
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;

  return (
    <aside
      className={`sticky top-0 h-screen shrink-0 flex flex-col text-white overflow-hidden transition-[width] duration-200 ease-in-out ${
        expanded ? 'w-62' : 'w-[72px]'
      }`}
      style={{ width: expanded ? 248 : 72, background: '#2A3E4B' }}
    >
      <div className={`flex items-center pt-6 pb-7 ${expanded ? 'gap-3 px-6' : 'justify-center px-0'}`}>
        <img src={kapitlogo} alt="KapitPondo" className="w-10 h-10 shrink-0 object-contain" />
        {expanded ? (
          <div className="whitespace-nowrap">
            <div className="text-base font-bold">KapitPondo</div>
            <div className="text-[11px] text-white/50">Admin Console</div>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 px-3.5 overflow-y-auto overflow-x-hidden">
        <NavSection title="Home" items={HOME_NAV} pending={pending} expanded={expanded} />
        <NavSection title="System Health" items={SYSTEM_HEALTH_NAV} pending={pending} expanded={expanded} />
      </nav>
    </aside>
  );
}
