/**
 * apps/admin/src/features/feedback/FeedbackPage.tsx — in-app feedback members
 * send from the mobile app's "Send Feedback" screen (GET /admin/feedback).
 * Read-only: feedback has no workflow, unlike Complaints.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bug, Inbox, MessageSquare, MoreHorizontal, Search, Sparkles, type LucideIcon } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Dialog } from '../../components/ui/Dialog';
import { Avatar } from '../../components/ui/Avatar';

type Category = 'bug' | 'feature' | 'general' | 'other';

type Feedback = {
  id: string;
  category: Category;
  message: string;
  app_version: string | null;
  platform: string | null;
  created_at: string;
  read_at: string | null;
  member_name: string | null;
  member_email: string | null;
  member_phone: string | null;
  member_avatar_url: string | null;
};

const CATEGORY: Record<Category, { label: string; icon: LucideIcon; tone: string }> = {
  bug: { label: 'Bug report', icon: Bug, tone: 'bg-danger-bg text-danger' },
  feature: { label: 'Feature request', icon: Sparkles, tone: 'bg-brand/10 text-brand-dark' },
  general: { label: 'General feedback', icon: MessageSquare, tone: 'bg-success-bg text-success' },
  other: { label: 'Something else', icon: MoreHorizontal, tone: 'bg-surface-alt text-muted' },
};
type Filter = 'all' | 'unread' | Category;
const FILTERS: Filter[] = ['all', 'unread', 'bug', 'feature', 'general', 'other'];

/** Fired after marking feedback read so the sidebar badge re-counts. */
export const FEEDBACK_READ_EVENT = 'admin:feedback-read';

function CategoryPill({ category }: { category: Category }) {
  const c = CATEGORY[category] ?? CATEGORY.other;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${c.tone}`}>
      <c.icon size={12} /> {c.label}
    </span>
  );
}

function platformLabel(f: Feedback) {
  const p = f.platform ? { ios: 'iOS', android: 'Android', web: 'Web' }[f.platform] ?? f.platform : null;
  return [p, f.app_version ? `v${f.app_version}` : null].filter(Boolean).join(' · ') || '—';
}

export function FeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Feedback | null>(null);

  useEffect(() => {
    api.get<{ feedback: Feedback[] }>('/admin/feedback')
      .then((r) => setItems(r.feedback))
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Failed to load feedback.'))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, unread: 0 };
    for (const f of items) {
      c[f.category] = (c[f.category] ?? 0) + 1;
      if (!f.read_at) c.unread++;
    }
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((f) =>
      (filter === 'all' || (filter === 'unread' ? !f.read_at : f.category === filter)) &&
      (!q || [f.message, f.member_name, f.member_email].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [items, filter, query]);

  function openItem(f: Feedback) {
    setOpen(f);
    if (f.read_at) return;
    const now = new Date().toISOString();
    setItems((list) => list.map((x) => (x.id === f.id ? { ...x, read_at: now } : x)));
    api.post(`/admin/feedback/${f.id}/read`, {})
      .then(() => window.dispatchEvent(new Event(FEEDBACK_READ_EVENT)))
      .catch(() => { /* stays unread server-side; the next load shows it again */ });
  }

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8 space-y-5">
      {err && <div className="rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((k) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border ${filter === k ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted'}`}>
              {k === 'all' ? 'All' : k === 'unread' ? 'Unread' : CATEGORY[k].label} ({counts[k] ?? 0})
            </button>
          ))}
        </div>
        <div className="ml-auto w-72 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search message or member"
            className="w-full bg-surface border border-line rounded-lg pl-9 pr-3 py-2 text-[13px] text-ink outline-none focus:border-brand" />
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium whitespace-nowrap">Received</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Type</th>
              <th className="px-5 py-3 font-medium">Message</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">From</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Device</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted">
                  <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                  {items.length === 0 ? 'No feedback yet.' : 'No feedback matches these filters.'}
                </td>
              </tr>
            ) : shown.map((f) => (
              <tr key={f.id} onClick={() => openItem(f)}
                className={`border-b border-line last:border-0 cursor-pointer hover:bg-surface-alt ${f.read_at ? '' : 'bg-danger-bg/30 font-semibold'}`}>
                <td className="px-5 py-3.5 text-secondary whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${f.read_at ? 'bg-transparent' : 'bg-danger'}`} aria-label={f.read_at ? undefined : 'Unread'} />
                    {formatDateTime(f.created_at)}
                  </span>
                </td>
                <td className="px-5 py-3.5"><CategoryPill category={f.category} /></td>
                <td className="px-5 py-3.5 text-ink max-w-md"><div className="line-clamp-2">{f.message}</div></td>
                <td className="px-5 py-3.5 text-ink whitespace-nowrap">{f.member_name ?? '—'}</td>
                <td className="px-5 py-3.5 text-secondary whitespace-nowrap">{platformLabel(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!open} onClose={() => setOpen(null)} icon={open ? CATEGORY[open.category]?.icon : undefined}
        title={open ? CATEGORY[open.category]?.label ?? 'Feedback' : 'Feedback'}
        subtitle={open ? formatDateTime(open.created_at) : undefined}>
        {open && (
          <div className="space-y-5">
            <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap break-words">{open.message}</p>
            <div className="flex items-center gap-3 rounded-xl bg-surface-alt px-4 py-3">
              <Avatar name={open.member_name} email={open.member_email} url={open.member_avatar_url} size={36} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink truncate">{open.member_name ?? 'Unknown member'}</div>
                <div className="text-[11px] text-muted truncate">{[open.member_email, open.member_phone].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </div>
            <div className="text-xs text-muted">Sent from {platformLabel(open)}</div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
