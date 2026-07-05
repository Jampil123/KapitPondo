/**
 * apps/admin/src/features/overview/OverviewPage.tsx
 * Platform headline numbers (GET /admin/monitoring/overview) + per-group
 * health table (GET /admin/monitoring/groups).
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatPeso } from '../../lib/format';

type Overview = {
  total_members: number;
  verified_members: number;
  total_groups: number;
  active_cycles: number;
  total_contributions: string;
  total_loans_disbursed: string;
  total_outstanding_balance: string;
};

type GroupRow = {
  group_id: string;
  group_name: string;
  fund_code: string;
  active_members: number;
  available_cash: string;
  active_loans: number;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-5">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

export function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [ov, gr] = await Promise.all([
          api.get<{ overview: Overview }>('/admin/monitoring/overview'),
          api.get<{ groups: GroupRow[] }>('/admin/monitoring/groups'),
        ]);
        if (!mounted) return;
        setOverview(ov.overview);
        setGroups(gr.groups ?? []);
      } catch (e) {
        if (mounted) setError(e instanceof ApiError ? e.message : 'Failed to load overview');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="text-sm text-muted">Loading…</div>;
  if (error) return <div className="rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink mb-4">Overview</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Members" value={overview?.total_members ?? 0} />
          <StatCard label="Verified Members" value={overview?.verified_members ?? 0} />
          <StatCard label="Active Groups" value={overview?.total_groups ?? 0} />
          <StatCard label="Active Cycles" value={overview?.active_cycles ?? 0} />
          <StatCard label="Total Contributions" value={formatPeso(overview?.total_contributions)} />
          <StatCard label="Loans Disbursed" value={formatPeso(overview?.total_loans_disbursed)} />
          <StatCard label="Outstanding Balance" value={formatPeso(overview?.total_outstanding_balance)} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Groups</h2>
        <div className="rounded-2xl bg-surface border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Group</th>
                <th className="px-4 py-3 font-medium">Fund Code</th>
                <th className="px-4 py-3 font-medium">Active Members</th>
                <th className="px-4 py-3 font-medium">Available Cash</th>
                <th className="px-4 py-3 font-medium">Active Loans</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No active groups yet.</td></tr>
              ) : groups.map((g) => (
                <tr key={g.group_id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{g.group_name}</td>
                  <td className="px-4 py-3 text-secondary tracking-wide">{g.fund_code}</td>
                  <td className="px-4 py-3 text-ink">{g.active_members}</td>
                  <td className="px-4 py-3 text-ink">{formatPeso(g.available_cash)}</td>
                  <td className="px-4 py-3 text-ink">{g.active_loans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
