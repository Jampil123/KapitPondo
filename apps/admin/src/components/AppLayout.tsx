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
import { FEEDBACK_READ_EVENT } from '../features/feedback/FeedbackPage';

// Single source of truth for each page's title/subtitle — replaces the
// duplicated <h1>/<p> block every page used to render for itself.
const TOPBAR_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Platform overview & account verification.' },
  '/verifications': { title: 'Users', subtitle: 'Account verification queue.' },
  '/groups': { title: 'Fund Group Monitoring', subtitle: 'Read-only overview of every fund group on the platform.' },
  '/audit': { title: 'Activity', subtitle: 'System activity monitor — every admin action.' },
  '/complaints': { title: 'Complaints', subtitle: 'Problems and complaints filed by members.' },
  '/feedback': { title: 'Feedback', subtitle: 'Bug reports, ideas and comments sent from the mobile app.' },
  '/reports': { title: 'Reports & Analytics', subtitle: 'Generate system-wide user, fund group and activity reports.' },
  '/system-config': { title: 'System Configuration', subtitle: 'Announcements, notification templates, categories, verification and policies.' },
  '/settings': { title: 'Profile & Settings', subtitle: 'Your profile, password, sessions and account recovery.' },
};

export function AppLayout() {
  const { admin, signOut } = useAdminAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<number | null>(null);
  const [newComplaints, setNewComplaints] = useState<number | null>(null);
  const [unreadFeedback, setUnreadFeedback] = useState<number | null>(null);
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

  // Unread feedback — also re-counted when the Feedback page marks one read.
  useEffect(() => {
    const load = () => api.get<{ unread: number | null }>('/admin/feedback/unread-count')
      .then((r) => setUnreadFeedback(r.unread))
      .catch(() => setUnreadFeedback(null));
    load();
    window.addEventListener(FEEDBACK_READ_EVENT, load);
    return () => window.removeEventListener(FEEDBACK_READ_EVENT, load);
  }, [location.pathname]);

  return (
    <div className="flex h-full min-h-screen">
      <div className="contents print:hidden">
        <Sidebar badges={{ pending_verifications: pending, new_complaints: newComplaints, unread_feedback: unreadFeedback }} admin={admin} onSignOut={async () => { await signOut(); nav('/login'); }} />
      </div>

      <main className="flex-1 overflow-auto bg-bg print:overflow-visible print:bg-surface">
        <Topbar title={meta.title} subtitle={meta.subtitle} admin={admin} />
        <Outlet />
      </main>
    </div>
  );
}
