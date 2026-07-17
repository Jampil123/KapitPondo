/**
 * apps/admin/src/components/AppLayout.tsx — page shell: sidebar + topbar
 * around the routed page content. See components/layout/ for the pieces.
 */
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { api } from '../lib/api';
import { Sidebar } from './layout/Sidebar';
import { Topbar } from './layout/Topbar';

// Single source of truth for each page's title/subtitle — replaces the
// duplicated <h1>/<p> block every page used to render for itself.
const TOPBAR_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Platform overview & account verification.' },
  '/verifications': { title: 'Users', subtitle: 'Account verification queue.' },
  '/groups': { title: 'Groups', subtitle: 'Active savings groups and their fund health.' },
  '/audit': { title: 'Activity', subtitle: 'System activity monitor — every admin action.' },
  '/settings': { title: 'Settings', subtitle: 'Your admin account and console preferences.' },
  '/system/database': { title: 'Database', subtitle: 'Database health & performance.' },
  '/system/auth-service': { title: 'Auth Service', subtitle: 'Authentication service health.' },
  '/system/storage': { title: 'Storage', subtitle: 'File storage health & usage.' },
  '/system/background-jobs': { title: 'Background Jobs', subtitle: 'Scheduled & queued job health.' },
};

export function AppLayout() {
  const { admin, signOut } = useAdminAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<number | null>(null);
  const [sidebarPinned, setSidebarPinned] = useState(false);
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
      <Sidebar pending={pending} pinned={sidebarPinned} />

      <main className="flex-1 overflow-auto bg-bg">
        <Topbar
          title={meta.title}
          subtitle={meta.subtitle}
          admin={admin}
          onSignOut={async () => { await signOut(); nav('/login'); }}
          onMenuClick={() => setSidebarPinned((v) => !v)}
        />
        <Outlet />
      </main>
    </div>
  );
}
