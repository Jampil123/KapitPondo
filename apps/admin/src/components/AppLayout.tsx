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
  '/groups': { title: 'Fund Group Monitoring', subtitle: 'Read-only overview of every fund group on the platform.' },
  '/audit': { title: 'Activity', subtitle: 'System activity monitor — every admin action.' },
  '/complaints': { title: 'Complaints', subtitle: 'Problems and complaints filed by members.' },
  '/reports': { title: 'Reports & Analytics', subtitle: 'Generate system-wide user, fund group and activity reports.' },
  '/system-config': { title: 'System Configuration', subtitle: 'Announcements, notification templates, categories, verification and policies.' },
  '/settings': { title: 'Settings', subtitle: 'Your admin account and console preferences.' },
};

export function AppLayout() {
  const { admin, signOut } = useAdminAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<number | null>(null);
  const [newComplaints, setNewComplaints] = useState<number | null>(null);
  // Child pages (e.g. /groups/:groupId) use their section's title.
  const meta = TOPBAR_META[location.pathname] ?? TOPBAR_META[`/${location.pathname.split('/')[1]}`] ?? TOPBAR_META['/'];

  useEffect(() => {
    // No dedicated metrics endpoint returns a pending count — derive it from
    // the real pending-verifications queue instead of a route that 404s.
    api.get<{ members: unknown[] }>('/admin/verifications?status=pending')
      .then((r) => setPending(r.members.length))
      .catch(() => setPending(null));
  }, []);

  // New (unhandled) complaints — re-counted on navigation so the badge drops
  // once the admin starts working them on the Complaints page.
  useEffect(() => {
    api.get<{ reports: unknown[] }>('/admin/problem-reports?status=new')
      .then((r) => setNewComplaints(r.reports.length))
      .catch(() => setNewComplaints(null));
  }, [location.pathname]);

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar badges={{ pending_verifications: pending, new_complaints: newComplaints }} admin={admin} onSignOut={async () => { await signOut(); nav('/login'); }} />

      <main className="flex-1 overflow-auto bg-bg">
        <Topbar title={meta.title} subtitle={meta.subtitle} admin={admin} />
        <Outlet />
      </main>
    </div>
  );
}
