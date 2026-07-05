/**
 * apps/admin/src/App.tsx — routes + auth guard (replaces the Vite template).
 * Guard rules:
 *   - not signed in            → /login
 *   - signed in, not sysadmin  → "not authorized" (with sign-out)
 *   - signed in + sysadmin     → the admin console (sidebar + pages)
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAdminAuth } from './context/AdminAuthContext';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './features/auth/LoginPage';
import { OverviewPage } from './features/overview/OverviewPage';
import { VerificationsPage } from './features/verifications/VerificationsPage';
import { AuditPage } from './features/audit/AuditPage';

function Loader() {
  return <div className="flex h-full items-center justify-center text-muted text-sm">Loading…</div>;
}

function NotAuthorized() {
  const { signOut } = useAdminAuth();
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm text-center rounded-2xl bg-surface border border-line p-8">
        <div className="text-lg font-bold text-ink mb-1">Not authorized</div>
        <p className="text-sm text-muted mb-5">This account isn’t a system administrator.</p>
        <button onClick={signOut} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          Sign out
        </button>
      </div>
    </div>
  );
}

function RequireSysadmin({ children }: { children: React.ReactNode }) {
  const { session, isSysadmin, loading } = useAdminAuth();
  if (loading) return <Loader />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isSysadmin) return <NotAuthorized />;
  return <>{children}</>;
}

export default function App() {
  const { session, loading } = useAdminAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <Loader /> : session ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        element={
          <RequireSysadmin>
            <AppLayout />
          </RequireSysadmin>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="verifications" element={<VerificationsPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
