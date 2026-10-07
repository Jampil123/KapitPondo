/**
 * apps/admin/src/features/settings/PasswordSection.tsx — change password
 * (POST /admin/account/password; the API checks the current one first).
 */
import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { TextField } from '../../components/ui/TextField';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

const MIN_LENGTH = 8;

export function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    if (next.length < MIN_LENGTH) return setErr(`New password must be at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setErr('New passwords don’t match.');
    if (next === current) return setErr('New password must be different from the current one.');
    setBusy(true);
    try {
      await api.post('/admin/account/password', { current_password: current, new_password: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to change your password.');
    } finally {
      setBusy(false);
    }
  }

  const type = show ? 'text' : 'password';
  const toggle = (
    <button type="button" onClick={() => setShow((v) => !v)} className="text-muted" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="max-w-md">
      {err && <ErrorBanner>{err}</ErrorBanner>}
      {saved && <div className="mb-4 rounded-lg bg-success-bg text-success text-sm px-3 py-2">Password changed.</div>}

      <label className="block text-xs font-semibold text-secondary mb-1.5">Current password</label>
      <div className="mb-3">
        <TextField icon={Lock} type={type} value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" endAdornment={toggle} />
      </div>
      <label className="block text-xs font-semibold text-secondary mb-1.5">New password</label>
      <div className="mb-3">
        <TextField icon={Lock} type={type} value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password"
                   placeholder={`At least ${MIN_LENGTH} characters`} />
      </div>
      <label className="block text-xs font-semibold text-secondary mb-1.5">Confirm new password</label>
      <div className="mb-5">
        <TextField icon={Lock} type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </div>

      <button type="submit" disabled={busy}
              className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {busy ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
}
