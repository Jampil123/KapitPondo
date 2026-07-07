/**
 * apps/admin/src/components/layout/Sidebar.tsx — dark sidebar shell: logo +
 * nav (Dashboard · Users · Groups · Activity · Settings), with a pending
 * badge on Users (from /admin/verifications?status=pending).
 */
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Boxes, Activity, Settings, Coins } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/verifications', label: 'Users', icon: Users, badgeKey: 'pending_verifications' },
  { to: '/groups', label: 'Groups', icon: Boxes },
  { to: '/audit', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ pending }: { pending: number | null }) {
  return (
    <aside className="w-62 shrink-0 flex flex-col text-white" style={{ width: 248, background: '#2A3E4B' }}>
      <div className="flex items-center gap-3 px-6 pt-6 pb-7">
        <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
          <Coins size={22} color="#fff" />
        </div>
        <div>
          <div className="text-base font-bold">KapitPondo</div>
          <div className="text-[11px] text-white/50">Admin Console</div>
        </div>
      </div>

      <nav className="flex-1 px-3.5 space-y-1.5">
        {NAV.map((n) => {
          const badge = n.badgeKey === 'pending_verifications' ? pending : null;
          return (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition-colors ${
                  isActive ? 'bg-brand text-white font-semibold' : 'text-white/60 hover:bg-white/5'
                }`
              }>
              {({ isActive }) => (
                <>
                  <n.icon size={20} color={isActive ? '#fff' : 'rgba(255,255,255,0.62)'} />
                  <span className="flex-1">{n.label}</span>
                  {badge ? (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center justify-center">
                      {badge}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
