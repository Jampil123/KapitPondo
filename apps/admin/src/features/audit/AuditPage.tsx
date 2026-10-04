/**
 * apps/admin/src/features/audit/AuditPage.tsx — system activity monitor.
 * Audit trail table: Date/Time · Administrator · Action · Target · Result,
 * from GET /admin/monitoring/audit (names resolved server-side). Filters by
 * the action prefix we actually emit (account.verified / rejected / id_viewed).
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type AuditEntry = {
  id: string;
  actor_id?: string;
  actor_name?: string | null;
  action: string;
  target_type: string;
  target_id?: string;
  target_name?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'account.verified', label: 'Verifications' },
  { key: 'account.rejected', label: 'Rejections' },
  { key: 'account.id_viewed', label: 'ID views' },
  { key: 'account.suspended', label: 'Suspensions' },
  { key: 'account.reinstated', label: 'Reinstatements' },
  { key: 'group.suspended', label: 'Group suspensions' },
  { key: 'config.updated', label: 'Configuration' },
];

// action → the verb phrase shown in the Action column, and the outcome shown
// in Result. Unknown actions fall back to a prettified form of the action
// itself rather than being hidden.
const ACTION_META: Record<string, { action: string; result: string; tone: string }> = {
  'account.verified': { action: 'Verify Account', result: 'Verified', tone: 'bg-success-bg text-success' },
  'account.rejected': { action: 'Reject Account', result: 'Rejected', tone: 'bg-danger-bg text-danger' },
  'account.id_viewed': { action: 'Review ID Document', result: 'Viewed', tone: 'bg-surface-alt text-secondary' },
  'account.suspended': { action: 'Suspend Account', result: 'Suspended', tone: 'bg-danger-bg text-danger' },
  'account.reinstated': { action: 'Reinstate Account', result: 'Reinstated', tone: 'bg-success-bg text-success' },
  'group.suspended': { action: 'Suspend Fund Group', result: 'Suspended', tone: 'bg-danger-bg text-danger' },
  'group.reinstated': { action: 'Reinstate Fund Group', result: 'Reinstated', tone: 'bg-success-bg text-success' },
  'config.updated': { action: 'Update System Configuration', result: 'Updated', tone: 'bg-surface-alt text-secondary' },
  'announcement.published': { action: 'Publish Announcement', result: 'Published', tone: 'bg-success-bg text-success' },
  'announcement.saved': { action: 'Save Announcement', result: 'Saved', tone: 'bg-surface-alt text-secondary' },
  'announcement.deleted': { action: 'Delete Announcement', result: 'Deleted', tone: 'bg-danger-bg text-danger' },
  'policy.published': { action: 'Publish Policy', result: 'Published', tone: 'bg-success-bg text-success' },
  'policy.drafted': { action: 'Draft Policy', result: 'Drafted', tone: 'bg-surface-alt text-secondary' },
  'policy.draft_deleted': { action: 'Delete Policy Draft', result: 'Deleted', tone: 'bg-danger-bg text-danger' },
};

function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function meta(e: AuditEntry) {
  const known = ACTION_META[e.action];
  if (known) return known;
  const verb = e.action.includes('.') ? e.action.split('.').slice(1).join(' ') : e.action;
  const pretty = titleCase(verb.replace(/[._]/g, ' '));
  return { action: pretty, result: pretty, tone: 'bg-surface-alt text-secondary' };
}

// "User Maria Santos" / "Group Lucena Group" / "Account 8785dc7e" when the
// record no longer exists.
function target(e: AuditEntry) {
  const kind = e.target_type === 'account' ? 'User' : titleCase(e.target_type ?? 'Record');
  if (e.target_name) return `${kind} ${e.target_name}`;
  return e.target_id ? `${kind} ${e.target_id.slice(0, 8)}` : '—';
}

function dateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

  const th = 'px-5 py-3 font-medium whitespace-nowrap';
  const td = 'px-5 py-3.5 whitespace-nowrap';

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

      <div className="rounded-2xl bg-surface border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className={th}>Date/Time</th>
              <th className={th}>Administrator</th>
              <th className={th}>Action</th>
              <th className={th}>Target</th>
              <th className={th}>Result</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">No activity recorded.</td></tr>
            ) : rows.map((e) => {
              const m = meta(e);
              const reason = e.metadata?.reason ? String(e.metadata.reason) : null;
              return (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className={`${td} text-secondary`}>{dateTime(e.created_at)}</td>
                  <td className={`${td} text-ink`}>{e.actor_name ?? (e.actor_id ? `Admin ${e.actor_id.slice(0, 8)}` : '—')}</td>
                  <td className={`${td} text-ink`}>{m.action}</td>
                  <td className={`${td} text-ink`}>{target(e)}</td>
                  <td className={td}>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.tone}`}>{m.result}</span>
                    {reason ? <span className="ml-2 text-[11.5px] text-muted">{reason}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
