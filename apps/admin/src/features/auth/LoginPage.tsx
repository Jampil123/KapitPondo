/** apps/admin/src/features/auth/LoginPage.tsx */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';

export function LoginPage() {
  const { signIn } = useAdminAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await signIn(email, password);
      nav('/'); // guard will bounce back to /login if not a sysadmin
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-surface border border-line p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xl font-bold text-ink">KapitPondo Admin</div>
          <div className="text-sm text-muted">Sign in to the system console</div>
        </div>
        {err && <div className="mb-4 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}
        <label className="block text-xs font-medium text-secondary mb-1">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
          className="mb-4 w-full rounded-lg bg-surface-alt px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brand" />
        <label className="block text-xs font-medium text-secondary mb-1">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
          className="mb-6 w-full rounded-lg bg-surface-alt px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brand" />
        <button disabled={busy}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
