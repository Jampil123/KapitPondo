/**
 * apps/admin/src/features/audit/AuditPage.tsx — system activity monitor.
 * Real feed from GET /admin/monitoring/audit. Filters by the action prefix we
 * actually emit (account.verified / rejected / id_viewed).
 */
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Clock, ShieldCheck, Eye, XCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';

type AuditEntry = { id: string; actor_id?: string; action: string; target_type: string; target_id?: string; metadata?: Record<string, unknown>; created_at: string };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'account.verified', label: 'Verifications' },
  { key: 'account.rejected', label: 'Rejections' },
  { key: 'account.id_viewed', label: 'ID views' },
];

function actionMeta(action: string): { label: string; tone: string; Icon: ComponentType<{ size?: number }> } {
  if (action === 'account.verified') return { label: 'Verification', tone: 'bg-success-bg text-success', Icon: CheckCircle2 };
  if (action === 'account.rejected') return { label: 'Rejection', tone: 'bg-danger-bg text-danger', Icon: XCircle };
  if (action === 'account.id_viewed') return { label: 'ID view', tone: 'bg-surface-alt text-brand-dark', Icon: Eye };
  return { label: action, tone: 'bg-surface-alt text-secondary', Icon: ShieldCheck };
}

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ audit: AuditEntry[] }>('/admin/monitoring/audit?limit=100')
      .then((r) => setEntries(r.audit))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => (filter === 'all' ? entries : entries.filter((e) => e.action === filter)), [entries, filter]);

  const stats = useMemo(() => ({
    total: entries.length,
    verified: entries.filter((e) => e.action === 'account.verified').length,
    rejected: entries.filter((e) => e.action === 'account.rejected').length,
    idviews: entries.filter((e) => e.action === 'account.id_viewed').length,
  }), [entries]);

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[['Total events', stats.total], ['Verifications', stats.verified], ['Rejections', stats.rejected], ['ID views', stats.idviews]].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl bg-surface border border-line p-4">
            <div className="text-2xl font-bold text-ink">{v}</div>
            <div className="text-xs text-secondary mt-1">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border ${filter === f.key ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">No activity recorded.</div>
        ) : rows.map((e, i, a) => {
          const meta = actionMeta(e.action);
          const reason = e.metadata?.reason;
          return (
            <div key={e.id} className={`grid items-center gap-3.5 px-6 py-3.5 ${i < a.length - 1 ? 'border-b border-line' : ''}`} style={{ gridTemplateColumns: 'auto 120px 1fr auto auto' }}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${meta.tone}`}><meta.Icon size={18} /></div>
              <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.tone}`}>{meta.label}</span>
              <div>
                <div className="text-[13.5px] text-ink">{e.target_type} {e.target_id ? `· ${e.target_id.slice(0, 8)}` : ''}{reason ? ` — ${String(reason)}` : ''}</div>
                <div className="text-[11.5px] text-muted">{e.actor_id ? `by ${e.actor_id.slice(0, 8)}` : ''}</div>
              </div>
              {e.action === 'account.rejected' ? (
                <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold bg-warning-bg text-warning">Warning</span>
              ) : <span />}
              <div className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap"><Clock size={14} /> {new Date(e.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
