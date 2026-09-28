/**
 * apps/admin/src/components/layout/NotificationBell.tsx — topbar bell +
 * dropdown over the system's own Notification Center (GET /me/notifications,
 * services/api notifications.routes.js). The admin is a `members` row, so
 * this reads the same table the mobile app does; admin-facing rows are
 * written by lib/notifications.js notifyAdmins(). New rows stream in over
 * Supabase Realtime (RLS + publication from migration 0022).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/format';

type Notification = {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
};

// Where clicking a notification takes the admin, by type prefix.
function routeFor(type: string): string | null {
  if (type.startsWith('identity.')) return '/verifications';
  return null;
}

export function NotificationBell({ memberId }: { memberId: string | undefined }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ notifications: Notification[] }>('/me/notifications?limit=30');
      setItems(r.notifications);
    } catch {
      // Leave the last known list in place; the bell just shows no new badge.
    } finally {
      setLoading(false);
    }
  }, []);

  // Data-fetch-on-mount; setState happens after the awaited request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Realtime: prepend rows the instant the backend inserts them.
  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Bind the session to the websocket explicitly so the "read own" RLS
      // policy authorizes the subscription (same fix as the mobile app).
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`admin-notifications:${memberId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${memberId}` },
          (payload) => {
            const row = payload.new as Notification;
            setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]));
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [memberId]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function openItem(n: Notification) {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api.post(`/me/notifications/${n.id}/read`).catch(() => load());
    }
    const to = routeFor(n.type);
    if (to) { setOpen(false); nav(to); }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    try { await api.post('/me/notifications/read-all'); } catch { load(); }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        className="relative p-1.5 text-muted hover:text-ink"
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell size={21} />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold flex items-center justify-center border-2 border-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-32px)] rounded-xl bg-surface border border-line shadow-lg overflow-hidden z-20">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-sm font-semibold text-ink">Notifications</h3>
            {unread > 0 ? (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-semibold text-brand-dark">
                <CheckCheck size={14} /> Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-muted">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</div>
            ) : items.map((n, i) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`w-full flex gap-3 px-4 py-3 text-left hover:bg-surface-alt ${i < items.length - 1 ? 'border-b border-line' : ''} ${n.is_read ? '' : 'bg-surface-alt/50'}`}
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-brand'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] text-ink ${n.is_read ? '' : 'font-semibold'}`}>{n.title ?? n.type.replace(/[._]/g, ' ')}</div>
                  {n.message ? <div className="text-[12px] text-secondary mt-0.5">{n.message}</div> : null}
                  <div className="text-[11px] text-muted mt-1">{formatDateTime(n.created_at)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
