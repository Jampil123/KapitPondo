/**
 * apps/admin/src/features/groups/GroupDetailPage.tsx — one Fund Group, opened
 * from Fund Group Monitoring (GET /admin/monitoring/fund-groups/:groupId).
 *
 * Read-only apart from platform suspension, which the System Administrator
 * may apply for a documented system-policy violation. There is no way from
 * here to approve contributions or loans, verify repayments, touch the
 * ledger, or change cycle / loan terms — those stay with the group's officers.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, RotateCcw, Lock, Users, Wallet, Landmark, PiggyBank, Crown, ShieldCheck, Calculator,
  Activity, MessageSquareWarning, CalendarClock,
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatPeso } from '../../lib/format';

type Summary = {
  member_count: number;
  total_contributions: string;
  outstanding_loans: string;
  outstanding_loan_count: number;
  fund_balance: string;
  last_activity_at: string | null;
};
type Officer = { membership_id: string; role: 'owner' | 'treasurer' | 'auditor'; full_name: string | null; phone: string | null; email: string | null; since: string | null };
type Cycle = {
  id: string; name: string; status: 'draft' | 'active' | 'closed';
  contribution_amount: string; frequency: string; contribution_due_day: number | null;
  penalty_amount: string; penalty_type: string; default_interest_rate: string | null;
  minimum_loan_amount: string | null; start_date: string; end_date: string | null;
};
type ActivityItem = { id: string; action: string; entity_type: string; actor_role: string | null; actor_name: string | null; created_at: string };
type Report = { id: string; category: string; subject: string; status: string; resolution: string | null; created_at: string; reporter_name: string | null };
type Detail = {
  group: {
    id: string; name: string; fund_code: string; description: string | null; status: 'active' | 'archived'; created_at: string;
    suspended_at: string | null; suspension_reason: string | null; suspended_by_name: string | null;
  };
  summary: Summary | null;
  member_counts: { active: number; pending: number; suspended: number; exited: number };
  officers: Officer[];
  cycles: Cycle[];
  activity: ActivityItem[];
  reports: Report[];
};

const ROLE_META: Record<Officer['role'], { label: string; icon: typeof Crown }> = {
  owner: { label: 'Organizer', icon: Crown },
  treasurer: { label: 'Treasurer', icon: Calculator },
  auditor: { label: 'Auditor', icon: ShieldCheck },
};

// Documented policy-violation reasons; the administrator can still edit them.
const VIOLATION_REASONS = ['Fraudulent activity', 'Misuse of member funds', 'Fake or duplicate members', 'Abusive conduct'];

const OPEN_REPORT = ['new', 'under_review', 'investigating'];

function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pretty(s: string) { return titleCase(s.replace(/[._]/g, ' ')); }
function initials(n?: string | null) { return (n ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }

function Card({ title, icon: Icon, right, children }: { title: string; icon: typeof Users; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface border border-line">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon size={16} className="text-brand-dark" /> {title}</div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Users }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-5">
      <div className="flex items-start justify-between">
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="w-10 h-10 rounded-xl bg-surface-alt text-brand-dark flex items-center justify-center"><Icon size={20} /></div>
      </div>
      <div className="text-xs text-secondary mt-1">{label}{sub ? <span className="text-muted"> · {sub}</span> : null}</div>
    </div>
  );
}

function kv(label: string, value?: string | null) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase text-muted">{label}</div>
      <div className="text-[13px] text-ink mt-0.5">{value || '—'}</div>
    </div>
  );
}

function Pill({ tone, children }: { tone: 'success' | 'danger' | 'warning' | 'muted'; children: React.ReactNode }) {
  const cls = {
    success: 'bg-success-bg text-success',
    danger: 'bg-danger-bg text-danger',
    warning: 'bg-warning-bg text-warning',
    muted: 'bg-surface-alt text-muted',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setDetail(await api.get<Detail>(`/admin/monitoring/fund-groups/${groupId}`)); setLoadErr(null); }
    catch (e) { setLoadErr((e as Error).message); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [groupId]);

  async function suspend() {
    if (!reason.trim()) return setErr('Document the policy violation first.');
    setBusy(true); setErr(null);
    try {
      await api.post(`/admin/fund-groups/${groupId}/suspend`, { reason: reason.trim() });
      setSuspending(false); setReason('');
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function reinstate() {
    setBusy(true); setErr(null);
    try { await api.post(`/admin/fund-groups/${groupId}/reinstate`); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
        <BackLink />
        <div className="py-16 text-center text-muted text-sm">{loadErr ?? 'Loading…'}</div>
      </div>
    );
  }

  const { group, summary, member_counts: mc, officers, cycles, activity, reports } = detail;
  const activeCycle = cycles.find((c) => c.status === 'active');
  const openReports = reports.filter((r) => OPEN_REPORT.includes(r.status)).length;

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-surface-alt text-brand-dark flex items-center justify-center text-lg font-semibold">{initials(group.name)}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink truncate">{group.name}</h1>
              {group.suspended_at ? <Pill tone="danger">Suspended</Pill>
                : <Pill tone={group.status === 'active' ? 'success' : 'muted'}>{group.status === 'active' ? 'Active' : 'Archived'}</Pill>}
              {openReports ? <Pill tone="warning">{openReports} open report{openReports === 1 ? '' : 's'}</Pill> : null}
            </div>
            <div className="text-xs text-muted mt-1">
              <span className="tracking-wide">{group.fund_code}</span> · Created {formatDate(group.created_at)}
              {summary?.last_activity_at ? <> · Last activity {formatDateTime(summary.last_activity_at)}</> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span title="Contributions, loans, repayments, the ledger and cycle terms are managed by the group's officers, not the System Administrator."
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1.5 text-xs font-semibold text-secondary">
            <Lock size={13} /> Read-only
          </span>
          {group.suspended_at ? (
            <button onClick={reinstate} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-success px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
              <RotateCcw size={14} /> {busy ? 'Reinstating…' : 'Reinstate group'}
            </button>
          ) : !suspending && (
            <button onClick={() => { setSuspending(true); setReason(''); setErr(null); }}
              className="flex items-center gap-1.5 rounded-lg border border-danger px-3.5 py-2 text-[13px] font-semibold text-danger hover:bg-danger-bg">
              <Ban size={14} /> Suspend group
            </button>
          )}
        </div>
      </div>

      {group.suspended_at && (
        <div className="flex items-start gap-3 mb-5 rounded-xl bg-danger-bg px-4 py-3">
          <Ban size={18} className="shrink-0 mt-0.5 text-danger" />
          <div className="text-[13px]">
            <div className="font-semibold text-danger">
              Suspended {formatDate(group.suspended_at)}{group.suspended_by_name ? ` by ${group.suspended_by_name}` : ''}
            </div>
            <div className="text-ink mt-0.5">{group.suspension_reason || 'No reason recorded.'}</div>
            <div className="text-muted mt-1">Members can view records but can't make changes until reinstated.</div>
          </div>
        </div>
      )}

      {suspending && !group.suspended_at && (
        <div className="mb-5 rounded-2xl border border-danger bg-surface p-5 space-y-3">
          <div className="text-sm font-semibold text-ink">Suspend {group.name}?</div>
          <div className="flex flex-wrap gap-2">
            {VIOLATION_REASONS.map((r) => (
              <button key={r} onClick={() => { setReason(r); setErr(null); }}
                className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border ${reason === r ? 'border-danger bg-danger-bg text-danger' : 'border-line bg-surface text-secondary'}`}>
                {r}
              </button>
            ))}
          </div>
          <textarea value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} rows={2} autoFocus
            placeholder="Policy violation (members see this)"
            className="w-full rounded-xl bg-surface-alt p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-danger" />
          <div className="text-[12px] text-muted">Freezes all group activity. Balances and records stay as they are.</div>
          <div className="flex gap-3 max-w-md">
            <button onClick={() => { setSuspending(false); setReason(''); setErr(null); }} className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-secondary">Cancel</button>
            <button onClick={suspend} disabled={busy || !reason.trim()} className="flex-1 rounded-lg bg-danger py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Suspending…' : 'Suspend group'}
            </button>
          </div>
        </div>
      )}

      {err && <div className="mb-5 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}

      {/* Figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Kpi label="Active Members" value={String(mc.active)} sub={mc.pending ? `${mc.pending} pending` : undefined} icon={Users} />
        <Kpi label="Fund Balance" value={formatPeso(summary?.fund_balance)} icon={Wallet} />
        <Kpi label="Total Contributions" value={formatPeso(summary?.total_contributions)} icon={PiggyBank} />
        <Kpi label="Outstanding Loans" value={formatPeso(summary?.outstanding_loans)}
          sub={summary ? `${summary.outstanding_loan_count} loan${summary.outstanding_loan_count === 1 ? '' : 's'}` : undefined} icon={Landmark} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Organizer & officers */}
        <Card title="Organizer & Officers" icon={Crown}
          right={<span className="text-xs text-muted">{mc.suspended ? `${mc.suspended} suspended · ` : ''}{mc.exited} exited</span>}>
          {officers.length === 0 ? <div className="text-sm text-muted">No active officers.</div> : (
            <div className="divide-y divide-line">
              {officers.map((o) => {
                const R = ROLE_META[o.role];
                return (
                  <div key={o.membership_id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-xs font-semibold">{initials(o.full_name)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">{o.full_name ?? '—'}</div>
                      <div className="text-xs text-muted truncate">{[o.phone, o.email].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-brand-dark">
                      <R.icon size={12} /> {R.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Fund cycle */}
        <Card title="Fund Cycle" icon={CalendarClock}
          right={<span className="text-xs text-muted">{cycles.length} cycle{cycles.length === 1 ? '' : 's'}</span>}>
          {activeCycle ? (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-3 flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">{activeCycle.name}</span>
                <Pill tone="success">Active</Pill>
              </div>
              {kv('Contribution', `${formatPeso(activeCycle.contribution_amount)} · ${activeCycle.frequency}`)}
              {kv('Due day', activeCycle.contribution_due_day ? `Day ${activeCycle.contribution_due_day}` : null)}
              {kv('Late penalty', activeCycle.penalty_type === 'percent' ? `${Number(activeCycle.penalty_amount)}%` : formatPeso(activeCycle.penalty_amount))}
              {kv('Loan interest', activeCycle.default_interest_rate != null ? `${+(Number(activeCycle.default_interest_rate) * 100).toFixed(2)}% / mo` : null)}
              {kv('Minimum loan', activeCycle.minimum_loan_amount != null ? formatPeso(activeCycle.minimum_loan_amount) : null)}
              {kv('Period', `${formatDate(activeCycle.start_date)} – ${activeCycle.end_date ? formatDate(activeCycle.end_date) : 'open'}`)}
            </div>
          ) : <div className="text-sm text-muted mb-4">No active cycle.</div>}
          {cycles.filter((c) => c !== activeCycle).length > 0 && (
            <div className="border-t border-line pt-3 space-y-2">
              {cycles.filter((c) => c !== activeCycle).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink">{c.name}</span>
                  <span className="text-muted">{formatPeso(c.contribution_amount)} · {formatDate(c.start_date)} · {titleCase(c.status)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Activity */}
        <Card title="Group Activity" icon={Activity} right={<span className="text-xs text-muted">Latest {activity.length}</span>}>
          {activity.length === 0 ? <div className="text-sm text-muted">No activity yet.</div> : (
            <div className="max-h-96 overflow-y-auto -mx-1 px-1 divide-y divide-line">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <div className="text-[13px] text-ink">{pretty(a.action)}</div>
                    <div className="text-xs text-muted truncate">
                      {a.actor_name ?? 'System'}{a.actor_role ? ` · ${a.actor_role === 'owner' ? 'Organizer' : titleCase(a.actor_role)}` : ''}
                    </div>
                  </div>
                  <div className="text-xs text-muted whitespace-nowrap">{formatDateTime(a.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Reports */}
        <Card title="Reports" icon={MessageSquareWarning}
          right={<Link to="/complaints" className="text-xs font-semibold text-brand-dark">Open queue</Link>}>
          {reports.length === 0 ? <div className="text-sm text-muted">No reports filed about this group.</div> : (
            <div className="divide-y divide-line">
              {reports.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">{r.subject}</div>
                    <div className="text-xs text-muted truncate">{pretty(r.category)} · {r.reporter_name ?? 'Unknown'} · {formatDate(r.created_at)}</div>
                  </div>
                  <Pill tone={OPEN_REPORT.includes(r.status) ? 'warning' : 'muted'}>{pretty(r.resolution ?? r.status)}</Pill>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/groups" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-secondary mb-4 hover:text-ink">
      <ArrowLeft size={15} /> Fund Groups
    </Link>
  );
}
