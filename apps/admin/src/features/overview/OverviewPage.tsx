/**
 * apps/admin/src/features/overview/OverviewPage.tsx — the admin dashboard.
 * KPI cards + pending-verifications + recent activity from the real API.
 * Honest placeholders: growth chart (needs a time-series endpoint) and system
 * health (needs infra checks) — labelled, not faked.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Boxes, ShieldCheck, Flag, Check, X, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';

// Mirrors the real platform_overview() SQL function (services/api monitoring.service.js).
type Overview = { total_members: number; verified_members: number; total_groups: number; active_cycles: number };
type Applicant = { id: string; full_name?: string; email?: string; phone?: string };
type AuditEntry = { id: string; action: string; target_type: string; created_at: string; metadata?: Record<string, unknown> };

const TONE: Record<string, string> = {
  accent: 'bg-surface-alt text-brand-dark',
  ok: 'bg-success-bg text-success',
  warn: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
};

function Kpi({ label, value, delta, icon: Icon, tone }: { label: string; value: string; delta: string; icon: ComponentType<{ size?: number }>; tone: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-bold text-ink">{value}</div>
          <div className="text-xs text-secondary mt-1">{label}</div>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${TONE[tone]}`}><Icon size={20} /></div>
      </div>
      <div className="text-[11px] text-muted mt-3">{delta}</div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface border border-line">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function initials(n?: string) { return (n ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }

export function OverviewPage() {
  const nav = useNavigate();
  const [m, setM] = useState<Overview | null>(null);
  const [pending, setPending] = useState<Applicant[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [overview, verifs, audit] = await Promise.allSettled([
      api.get<{ overview: Overview }>('/admin/monitoring/overview'),
      api.get<{ members: Applicant[] }>('/admin/verifications?status=pending'),
      api.get<{ audit: AuditEntry[] }>('/admin/monitoring/audit?limit=6'),
    ]);
    if (overview.status === 'fulfilled') setM(overview.value.overview);
    if (verifs.status === 'fulfilled') { setPending(verifs.value.members.slice(0, 4)); setPendingCount(verifs.value.members.length); }
    if (audit.status === 'fulfilled') setActivity(audit.value.audit);
  }
  // Standard data-fetch-on-mount effect; the setState calls inside `load` are
  // async (after the awaited requests resolve), not synchronous in the effect body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setBusyId(id);
    try { await api.post(`/admin/verifications/${id}/approve`); await load(); }
    finally { setBusyId(null); }
  }

  const kpis = [
    { label: 'Total Users', value: m ? String(m.total_members) : '—', delta: `${m?.verified_members ?? '—'} verified`, icon: Users, tone: 'accent' },
    { label: 'Total Groups', value: m ? String(m.total_groups) : '—', delta: `${m?.active_cycles ?? '—'} active cycles`, icon: Boxes, tone: 'ok' },
    { label: 'Pending Verifications', value: pendingCount === null ? '—' : String(pendingCount), delta: 'Needs review', icon: ShieldCheck, tone: 'warn' },
    { label: 'Reports / Flags', value: '0', delta: 'No flag system yet', icon: Flag, tone: 'danger' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-8 pt-6 pb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Platform growth">
            <div className="p-8 text-center text-muted text-sm">Time-series charts will appear here once a growth endpoint is added.</div>
          </Card>

          <Card title="Pending verifications"
                action={<button onClick={() => nav('/verifications')} className="flex items-center gap-1 text-xs font-semibold text-brand-dark">View all <ChevronRight size={14} /></button>}>
            {pending.length === 0 ? (
              <div className="p-8 text-center text-muted text-sm">No accounts awaiting review.</div>
            ) : pending.map((u, i) => (
              <div key={u.id} className={`flex items-center gap-3 px-5 py-3 ${i < pending.length - 1 ? 'border-b border-line' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-xs font-semibold">{initials(u.full_name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">{u.full_name ?? 'Applicant'}</div>
                  <div className="text-[11px] text-muted truncate">{u.phone ?? u.email ?? u.id}</div>
                </div>
                <button onClick={() => approve(u.id)} disabled={busyId === u.id}
                        className="w-9 h-9 rounded-lg bg-success-bg text-success flex items-center justify-center disabled:opacity-50" title="Approve">
                  <Check size={18} />
                </button>
                <button onClick={() => nav('/verifications')} className="w-9 h-9 rounded-lg bg-danger-bg text-danger flex items-center justify-center" title="Review / reject">
                  <X size={18} />
                </button>
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="System health">
            <div className="p-2">
              {['Database', 'Auth service', 'Storage', 'Background jobs'].map((r, i, a) => (
                <div key={r} className={`flex items-center justify-between px-3 py-3 ${i < a.length - 1 ? 'border-b border-line' : ''}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-muted" />
                    <span className="text-[13px] text-ink">{r}</span>
                  </div>
                  <span className="text-[12px] text-muted">Not monitored</span>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 text-[11px] text-muted">Connect real health checks to populate.</div>
          </Card>

          <Card title="Recent activity"
                action={<button onClick={() => nav('/audit')} className="text-muted"><ChevronRight size={16} /></button>}>
            {activity.length === 0 ? (
              <div className="p-6 text-center text-muted text-sm">No activity yet.</div>
            ) : activity.map((e, i) => (
              <div key={e.id} className={`px-5 py-3 ${i < activity.length - 1 ? 'border-b border-line' : ''}`}>
                <div className="text-[13px] text-ink">{e.action.replace(/[._]/g, ' ')}</div>
                <div className="text-[11px] text-muted">{new Date(e.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
