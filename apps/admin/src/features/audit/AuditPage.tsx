/**
 * apps/admin/src/features/audit/AuditPage.tsx
 * System-wide audit feed (GET /admin/monitoring/audit).
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

type AuditRow = {
  id: string;
  actor_id: string | null;
  group_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  members: { full_name: string } | null;
};

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.get<{ audit: AuditRow[] }>('/admin/monitoring/audit')
      .then((res) => { if (mounted) setRows(res.audit ?? []); })
      .catch((e) => { if (mounted) setError(e instanceof ApiError ? e.message : 'Failed to load audit log'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold text-ink mb-4">Audit Log</h1>

      {error && <div className="mb-4 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>}

      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No audit entries yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-secondary">{formatDateTime(r.created_at)}</td>
                <td className="px-4 py-3 text-ink">{r.members?.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-ink">{r.action}</td>
                <td className="px-4 py-3 text-secondary">{r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
