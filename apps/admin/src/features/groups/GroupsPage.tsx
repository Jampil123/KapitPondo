/**
 * apps/admin/src/features/groups/GroupsPage.tsx — Fund Group Monitoring.
 * Read-only, platform-wide overview of every Fund Group
 * (GET /admin/monitoring/fund-groups → fund_groups_monitoring(), migration 0055).
 *
 * Deliberately has no actions: the System Administrator observes groups but
 * never approves their contributions or loans — that stays with each
 * group's officers (Owner / Treasurer / Auditor).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Users, Wallet, Landmark, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatPeso } from '../../lib/format';

type FundGroup = {
  group_id: string;
  group_name: string;
  fund_code: string;
  organizer_id: string | null;
  organizer_name: string | null;
  member_count: number;
  active_cycle_id: string | null;
  active_cycle_name: string | null;
  active_cycle_amount: string | null;
  active_cycle_frequency: string | null;
  total_contributions: string;
  outstanding_loans: string;
  outstanding_loan_count: number;
  fund_balance: string;
  group_status: 'active' | 'archived';
  created_at: string;
  last_activity_at: string | null;
};

type StatusFilter = 'all' | 'active' | 'archived';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
];

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatDate(iso);
}

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
  const [groups, setGroups] = useState<FundGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // ?status=active|archived — the Dashboard's Fund Group Statistics tiles link here.
  const [searchParams] = useSearchParams();
  const linkedStatus = searchParams.get('status');
  const [status, setStatus] = useState<StatusFilter>(
    linkedStatus === 'active' || linkedStatus === 'archived' ? linkedStatus : 'all',
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get<{ groups: FundGroup[] }>('/admin/monitoring/fund-groups')
      .then((res) => { if (mounted) setGroups(res.groups ?? []); })
      .catch(() => { if (mounted) setGroups([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const totals = useMemo(() => ({
    groups: groups.length,
    members: groups.reduce((sum, g) => sum + (g.member_count ?? 0), 0),
    fund: groups.reduce((sum, g) => sum + (Number(g.fund_balance) || 0), 0),
    outstanding: groups.reduce((sum, g) => sum + (Number(g.outstanding_loans) || 0), 0),
  }), [groups]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) =>
      (status === 'all' || g.group_status === status) &&
      (!q || g.group_name.toLowerCase().includes(q) || g.fund_code.toLowerCase().includes(q) || (g.organizer_name ?? '').toLowerCase().includes(q)),
    );
  }, [groups, status, query]);

  const th = 'px-4 py-3 font-medium whitespace-nowrap';
  const td = 'px-4 py-3 whitespace-nowrap';

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Fund Groups" value={String(totals.groups)} icon={Boxes} />
        <Kpi label="Active Members" value={String(totals.members)} icon={Users} />
        <Kpi label="Fund Under Management" value={formatPeso(totals.fund)} icon={Wallet} />
        <Kpi label="Outstanding Loans" value={formatPeso(totals.outstanding)} icon={Landmark} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => {
            const count = f.key === 'all' ? groups.length : groups.filter((g) => g.group_status === f.key).length;
            return (
              <button key={f.key} onClick={() => setStatus(f.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border ${status === f.key ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted'}`}>
                {f.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-3.5 py-2.5 w-72">
          <Search size={17} className="text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search group, fund code, organizer…"
            className="flex-1 bg-transparent text-sm text-ink outline-none" />
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className={th}>Fund Group</th>
              <th className={th}>Organizer</th>
              <th className={`${th} text-right`}>Members</th>
              <th className={th}>Active Fund Cycle</th>
              <th className={`${th} text-right`}>Total Contributions</th>
              <th className={`${th} text-right`}>Outstanding Loans</th>
              <th className={`${th} text-right`}>Fund Balance</th>
              <th className={th}>Status</th>
              <th className={th}>Created</th>
              <th className={th}>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-center text-muted">
                  <Boxes size={28} className="mx-auto mb-2 opacity-40" />
                  {groups.length === 0 ? 'No fund groups yet.' : 'No fund groups match your filters.'}
                </td>
              </tr>
            ) : rows.map((g) => (
              <tr key={g.group_id} className="border-b border-line last:border-0">
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-[11px] font-semibold shrink-0">
                      {initials(g.group_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-ink font-medium">{g.group_name}</div>
                      <div className="text-[11px] text-muted tracking-wide">{g.fund_code}</div>
                    </div>
                  </div>
                </td>
                <td className={`${td} text-ink`}>{g.organizer_name ?? '—'}</td>
                <td className={`${td} text-ink text-right`}>{g.member_count}</td>
                <td className={td}>
                  {g.active_cycle_name ? (
                    <>
                      <div className="text-ink">{g.active_cycle_name}</div>
                      <div className="text-[11px] text-muted">{formatPeso(g.active_cycle_amount)} · {g.active_cycle_frequency}</div>
                    </>
                  ) : <span className="text-muted">No active cycle</span>}
                </td>
                <td className={`${td} text-ink text-right`}>{formatPeso(g.total_contributions)}</td>
                <td className={`${td} text-right`}>
                  <div className="text-ink">{formatPeso(g.outstanding_loans)}</div>
                  <div className="text-[11px] text-muted">{g.outstanding_loan_count} loan{g.outstanding_loan_count === 1 ? '' : 's'}</div>
                </td>
                <td className={`${td} text-ink font-medium text-right`}>{formatPeso(g.fund_balance)}</td>
                <td className={td}>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${g.group_status === 'active' ? 'bg-success-bg text-success' : 'bg-surface-alt text-muted'}`}>
                    {g.group_status === 'active' ? 'Active' : 'Archived'}
                  </span>
                </td>
                <td className={`${td} text-secondary`}>{formatDate(g.created_at)}</td>
                <td className={`${td} text-secondary`} title={formatDateTime(g.last_activity_at)}>{timeAgo(g.last_activity_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
