/**
 * apps/admin/src/features/settings/SessionsSection.tsx — active sessions
 * (GET /admin/account/sessions, migration 0067), sign-in history
 * (GET /me/login-activity) and "Sign out of all sessions". Rendered inside
 * the profile's Personal information card, so it carries its own heading.
 */
import { useEffect, useState } from 'react';
import { LogOut, Monitor } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { describeDevice } from '../../lib/device';
import { supabase } from '../../lib/supabase';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

type Session = { id: string; created_at: string; last_active: string; user_agent: string | null; ip: string | null; current: boolean };
type LoginEntry = { id: string; device_label: string | null; platform: string | null; app_version: string | null; created_at: string };

export function SessionsSection() {
  const [sessions, setSessions] = useState<Session[] | null | undefined>(undefined); // null = list unavailable
  const [logins, setLogins] = useState<LoginEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ sessions: Session[] | null }>('/admin/account/sessions')
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions(null));
    api.get<{ entries: LoginEntry[] }>('/me/login-activity')
      .then((r) => setLogins(r.entries))
      .catch((e) => { setLogins([]); setErr(e instanceof ApiError ? e.message : 'Failed to load sign-in history.'); });
  }, []);

  async function signOutEverywhere() {
    setErr(null);
    setBusy(true);
    try {
      await api.post('/admin/account/sessions/revoke', { scope: 'global' });
      // This browser's refresh token is gone too; clear it locally. The auth
      // guard then sends the admin to /login.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to sign out of all sessions.');
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="text-lg font-semibold text-ink">Sessions</div>
      <div className="text-xs text-muted mb-4">Where your account is signed in, and recent sign-ins</div>
      {err && <ErrorBanner>{err}</ErrorBanner>}

      {sessions !== null && (
        <div className="mb-5">
          <div className="text-[11px] font-semibold uppercase text-muted mb-2">Active sessions</div>
          {sessions === undefined ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Monitor size={18} className="text-brand-dark shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-ink flex items-center gap-2">
                      {describeDevice(s.user_agent)}
                      {s.current && <span className="rounded-full bg-success-bg text-success text-[10px] font-semibold px-2 py-0.5">This browser</span>}
                    </div>
                    <div className="text-xs text-muted">
                      {s.ip ? `${s.ip} · ` : ''}Signed in {formatDateTime(s.created_at)} · Last active {formatDateTime(s.last_active)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-6">
        <div className="text-[11px] font-semibold uppercase text-muted mb-2">Sign-in history</div>
        {logins === null ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : logins.length === 0 ? (
          <div className="text-sm text-muted">No sign-ins recorded yet.</div>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line max-h-72 overflow-auto">
            {logins.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[15px] font-medium">
                <span className="text-ink truncate">
                  {l.device_label ?? 'Unknown device'}
                  {l.platform && <span className="text-muted font-normal"> · {l.platform}</span>}
                </span>
                <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirming ? (
        <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3">
          <p className="text-sm text-ink mb-3">
            Sign out of every session, including this one? Other browsers lose access within an hour at most.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={signOutEverywhere} disabled={busy}
                    className="rounded-lg bg-danger px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
              {busy ? 'Signing out…' : 'Sign out everywhere'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                    className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-alt">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 rounded-lg border border-danger/40 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger-bg">
          <LogOut size={14} /> Sign out of all sessions
        </button>
      )}
    </div>
  );
}
