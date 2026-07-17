/**
 * apps/admin/src/features/groups/GroupsPage.tsx
 * Per-group health table (GET /admin/monitoring/groups) — the only real
 * groups-listing endpoint that exists on the backend today.
 */
import { useEffect, useMemo, useState } from 'react';
import { Boxes, Users, Wallet, Landmark } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatPeso } from '../../lib/format';

type GroupRow = {
  group_id: string;
  group_name: string;
  fund_code: string;
  active_members: number;
  available_cash: string;
  active_loans: number;
};

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Boxes }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-5">
      <div className="flex items-start justify-between">
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="w-10 h-10 rounded-xl bg-surface-alt text-brand-dark flex items-center justify-center"><Icon size={20} /></div>
      </div>
      <div className="text-xs text-secondary mt-1">{label}</div>
    </div>
  );
}

export function GroupsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.get<{ groups: GroupRow[] }>('/admin/monitoring/groups')
      .then((res) => { if (mounted) setGroups(res.groups ?? []); })
      .catch((e) => { if (mounted) setError(e instanceof ApiError ? e.message : 'Failed to load groups'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const totals = useMemo(() => ({
    groups: groups.length,
    activeMembers: groups.reduce((sum, g) => sum + (g.active_members ?? 0), 0),
    fund: groups.reduce((sum, g) => sum + (Number(g.available_cash) || 0), 0),
    activeLoans: groups.reduce((sum, g) => sum + (g.active_loans ?? 0), 0),
  }), [groups]);

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      {error && <div className="mb-4 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Groups" value={String(totals.groups)} icon={Boxes} />
        <Kpi label="Active Members" value={String(totals.activeMembers)} icon={Users} />
        <Kpi label="Fund Under Management" value={formatPeso(totals.fund)} icon={Wallet} />
        <Kpi label="Active Loans" value={String(totals.activeLoans)} icon={Landmark} />
      </div>

      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Group</th>
              <th className="px-5 py-3 font-medium">Fund Code</th>
              <th className="px-5 py-3 font-medium">Active Members</th>
              <th className="px-5 py-3 font-medium">Available Cash</th>
              <th className="px-5 py-3 font-medium">Active Loans</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Loading…</td></tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted">
                  <Boxes size={28} className="mx-auto mb-2 opacity-40" />
                  No active groups yet.
                </td>
              </tr>
            ) : groups.map((g) => {
              const active = g.active_members > 0;
              return (
                <tr key={g.group_id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {initials(g.group_name)}
                      </div>
                      <span className="text-ink font-medium">{g.group_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-secondary tracking-wide">{g.fund_code}</td>
                  <td className="px-5 py-3 text-ink">{g.active_members}</td>
                  <td className="px-5 py-3 text-ink">{formatPeso(g.available_cash)}</td>
                  <td className="px-5 py-3 text-ink">{g.active_loans}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? 'bg-success-bg text-success' : 'bg-surface-alt text-muted'}`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
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