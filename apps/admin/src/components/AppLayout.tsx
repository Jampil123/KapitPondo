/**
 * apps/admin/src/components/AppLayout.tsx — dark sidebar shell matching the design.
 * Nav: Dashboard · Users · Groups · Activity · Settings, with a pending badge on
 * Users (from /admin/metrics). Footer: admin identity + sign out.
 */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Boxes, Activity, Settings, Coins, LogOut, Search, Bell, ChevronDown } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { api } from '../lib/api';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/verifications', label: 'Users', icon: Users, badgeKey: 'pending_verifications' },
  { to: '/groups', label: 'Groups', icon: Boxes },
  { to: '/audit', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Single source of truth for each page's title/subtitle — replaces the
// duplicated <h1>/<p> block every page used to render for itself.
const TOPBAR_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Platform overview & account verification.' },
  '/verifications': { title: 'Users', subtitle: 'Account verification queue.' },
  '/groups': { title: 'Groups', subtitle: 'Active savings groups and their fund health.' },
  '/audit': { title: 'Activity', subtitle: 'System activity monitor — every admin action.' },
  '/settings': { title: 'Settings', subtitle: 'Your admin account and console preferences.' },
};

export function AppLayout() {
  const { admin, signOut } = useAdminAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<number | null>(null);
  const meta = TOPBAR_META[location.pathname] ?? TOPBAR_META['/'];

  useEffect(() => {
    // No dedicated metrics endpoint returns a pending count — derive it from
    // the real pending-verifications queue instead of a route that 404s.
    api.get<{ members: unknown[] }>('/admin/verifications?status=pending')
      .then((r) => setPending(r.members.length))
      .catch(() => setPending(null));
  }, []);

  return (
    <div className="flex h-full min-h-screen">
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

        <div className="flex items-center gap-3 mx-3 mb-4 px-4 py-4 border-t border-white/10">
          <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-sm font-semibold">
            {(admin?.email ?? 'A').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate">Admin User</div>
            <div className="text-[10.5px] text-white/45 truncate">{admin?.email ?? admin?.user_id}</div>
          </div>
          <button onClick={async () => { await signOut(); nav('/login'); }} className="text-white/50 hover:text-white">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-bg">
        <header className="flex items-center gap-5 h-[70px] px-7 bg-surface border-b border-line">
          <div className="shrink-0 leading-tight">
            <h1 className="text-xl font-bold text-ink">{meta.title}</h1>
            <p className="text-[13px] text-muted">{meta.subtitle}</p>
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

          <div className="flex items-center gap-2.5 pl-4 border-l border-line">
            <div className="w-9 h-9 rounded-lg bg-brand text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {(admin?.email ?? 'A').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate max-w-[150px]">Admin User</div>
              <div className="text-[11px] text-muted truncate max-w-[150px]">{admin?.email ?? admin?.user_id}</div>
            </div>
            <ChevronDown size={16} className="text-muted shrink-0" />
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
