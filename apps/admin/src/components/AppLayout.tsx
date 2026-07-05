/** apps/admin/src/components/AppLayout.tsx — sidebar shell for authed admin pages. */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/verifications', label: 'Verifications' },
  { to: '/audit', label: 'Audit log' },
];

export function AppLayout() {
  const { admin, signOut } = useAdminAuth();
  const nav = useNavigate();

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 border-r border-line bg-surface flex flex-col">
        <div className="px-5 py-5 border-b border-line">
          <div className="text-lg font-bold text-ink">KapitPondo</div>
          <div className="text-xs text-muted">System Admin</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-surface-alt text-brand-dark font-medium' : 'text-secondary hover:bg-surface-alt'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <div className="px-3 py-1 text-xs text-muted truncate">{admin?.email ?? admin?.user_id}</div>
          <button
            onClick={async () => { await signOut(); nav('/login'); }}
            className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-bg text-left"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
