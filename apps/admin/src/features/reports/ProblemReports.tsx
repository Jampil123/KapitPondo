/**
 * apps/admin/src/features/reports/ProblemReports.tsx — Reports of Problems /
 * Complaints: the queue members file into, and the System Administrator's
 * Review → Investigate → Resolve → Close workflow over it.
 *
 * The one thing this console deliberately cannot do is correct a group's
 * financial records. A complaint that needs a money fix is resolved as
 * "Referred to group officers" — the correction happens inside the fund
 * group's own authorized workflow.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Inbox, Landmark, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

type Status = 'new' | 'under_review' | 'investigating' | 'resolved' | 'closed';

type Report = {
  id: string;
  category: string;
  subject: string;
  description: string;
  status: Status;
  resolution: string | null;
  resolution_note: string | null;
  reporter_name: string | null;
  group_name: string | null;
  fund_code: string | null;
  handled_by_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  events?: {
    id: string; from_status: string | null; to_status: string | null;
    note: string | null; created_at: string; actor_name: string | null;
  }[];
};

type Meta = {
  categories: { key: string; label: string }[];
  statuses: Status[];
  resolutions: string[];
  next_status: Record<Status, Status[]>;
};

const STATUS_LABEL: Record<string, string> = {
  all: 'All', new: 'New', under_review: 'Under review',
  investigating: 'Investigating', resolved: 'Resolved', closed: 'Closed',
};

const STATUS_TONE: Record<string, string> = {
  new: 'bg-warning-bg text-warning',
  under_review: 'bg-brand/10 text-brand-dark',
  investigating: 'bg-brand/10 text-brand-dark',
  resolved: 'bg-success-bg text-success',
  closed: 'bg-surface-alt text-muted',
};

const RESOLUTION_LABEL: Record<string, string> = {
  resolved: 'Resolved by admin',
  referred_to_group: 'Referred to group officers',
  no_action: 'No action needed',
  duplicate: 'Duplicate report',
};

// The verb on the button that moves a report into each status.
const ACTION_LABEL: Record<Status, string> = {
  new: 'Reopen', under_review: 'Review', investigating: 'Investigate',
  resolved: 'Resolve', closed: 'Close',
};

const inputClass = 'w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand';

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[status] ?? 'bg-surface-alt text-muted'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ProblemReports() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('all');
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState<Report | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (category) params.set('category', category);
      const r = await api.get<{ available: boolean; reports: Report[]; counts: Record<string, number> }>(
        `/admin/problem-reports?${params.toString()}`,
      );
      setAvailable(r.available);
      setReports(r.reports);
      setCounts(r.counts);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [status, category]);

  useEffect(() => {
    api.get<Meta>('/admin/problem-reports/meta').then(setMeta).catch(() => setMeta(null));
  }, []);
  // Data-fetch effect; the setState calls inside `load` run after the awaited
  // request resolves, not synchronously in the effect body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const categoryLabel = useMemo(() => {
    const map = new Map((meta?.categories ?? []).map((c) => [c.key, c.label]));
    return (key: string) => map.get(key) ?? key.replace(/_/g, ' ');
  }, [meta]);

  async function openReport(id: string) {
    try {
      const r = await api.get<{ report: Report }>(`/admin/problem-reports/${id}`);
      setOpen(r.report);
    } catch { /* leave the drawer closed */ }
  }

  return (
    <div className="space-y-5">
      {!available && (
        <div className="flex items-start gap-2.5 rounded-xl bg-warning-bg px-4 py-3 text-[13px] text-warning">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Not set up yet.</span>{' '}
            Run migration <code>0056_problem_reports.sql</code> in the Supabase SQL Editor to start collecting reports.
          </span>
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-xl bg-surface-alt px-4 py-3 text-[13px] text-secondary">
        <Landmark size={16} className="shrink-0 mt-0.5 text-brand-dark" />
        <span>
          <span className="font-semibold text-ink">Financial corrections stay with the fund group.</span>{' '}
          Resolve money-related complaints as <span className="font-semibold">Referred to group officers</span> — the group's Owner, Treasurer and Auditor make corrections through their own workflow.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {['all', ...(meta?.statuses ?? [])].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border ${status === s ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted'}`}>
              {STATUS_LABEL[s] ?? s}{counts[s] !== undefined ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>
        <div className="ml-auto w-64">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            <option value="">All categories</option>
            {meta?.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium whitespace-nowrap">Filed</th>
              <th className="px-5 py-3 font-medium">Subject</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Category</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Reported by</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Fund Group</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Status</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Handled by</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">Loading…</td></tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted">
                  <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                  {available ? 'No reports match these filters.' : 'No reports yet.'}
                </td>
              </tr>
            ) : reports.map((r) => (
              <tr key={r.id} onClick={() => openReport(r.id)} className="border-b border-line last:border-0 cursor-pointer hover:bg-surface-alt">
                <td className="px-5 py-3.5 text-secondary whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                <td className="px-5 py-3.5 text-ink font-medium">{r.subject}</td>
                <td className="px-5 py-3.5 text-secondary whitespace-nowrap">{categoryLabel(r.category)}</td>
                <td className="px-5 py-3.5 text-ink whitespace-nowrap">{r.reporter_name ?? '—'}</td>
                <td className="px-5 py-3.5 text-ink whitespace-nowrap">{r.group_name ?? '—'}</td>
                <td className="px-5 py-3.5"><StatusPill status={r.status} /></td>
                <td className="px-5 py-3.5 text-secondary whitespace-nowrap">{r.handled_by_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && meta && (
        <ReportDrawer
          report={open}
          meta={meta}
          categoryLabel={categoryLabel}
          onClose={() => setOpen(null)}
          onUpdated={(r) => { setOpen(r); load(); }}
        />
      )}
    </div>
  );
}

function ReportDrawer({ report, meta, categoryLabel, onClose, onUpdated }: {
  report: Report;
  meta: Meta;
  categoryLabel: (key: string) => string;
  onClose: () => void;
  onUpdated: (r: Report) => void;
}) {
  const [target, setTarget] = useState<Status | null>(null);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('resolved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = meta.next_status[report.status] ?? [];

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ report: Report }>(`/admin/problem-reports/${report.id}/status`, {
        status: target,
        note: note || undefined,
        resolution: target === 'resolved' ? resolution : undefined,
        resolution_note: target === 'resolved' ? note || undefined : undefined,
      });
      setTarget(null);
      setNote('');
      onUpdated(r.report);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update this report');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-[560px] max-w-full h-full bg-bg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between gap-4 px-6 py-4 bg-surface border-b border-line">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-ink">{report.subject}</div>
            <div className="text-[12px] text-muted mt-0.5">{categoryLabel(report.category)} · filed {formatDateTime(report.created_at)}</div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-ink" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2">
            <StatusPill status={report.status} />
            {report.resolution ? <span className="text-[12px] text-secondary">{RESOLUTION_LABEL[report.resolution] ?? report.resolution}</span> : null}
          </div>

          <div className="rounded-xl bg-surface border border-line p-4 space-y-3">
            <Field label="Reported by" value={report.reporter_name} />
            <Field label="Fund group" value={report.group_name ? `${report.group_name}${report.fund_code ? ` · ${report.fund_code}` : ''}` : null} />
            <Field label="Handled by" value={report.handled_by_name} />
            <div>
              <div className="text-[10px] font-semibold uppercase text-muted">Description</div>
              <p className="text-[13px] text-ink mt-1 whitespace-pre-wrap">{report.description}</p>
            </div>
            {report.resolution_note ? (
              <div>
                <div className="text-[10px] font-semibold uppercase text-muted">Resolution note</div>
                <p className="text-[13px] text-ink mt-1 whitespace-pre-wrap">{report.resolution_note}</p>
              </div>
            ) : null}
          </div>

          {/* Workflow */}
          {next.length > 0 ? (
            <div className="rounded-xl bg-surface border border-line p-4">
              <div className="text-[13px] font-semibold text-ink mb-3">Move this report forward</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {next.map((s) => (
                  <button key={s} onClick={() => setTarget(s)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${target === s ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:bg-surface-alt'}`}>
                    {ACTION_LABEL[s]} <ArrowRight size={14} />
                  </button>
                ))}
              </div>

              {target === 'resolved' && (
                <div className="mb-3">
                  <label className="block text-[11px] font-semibold uppercase text-muted mb-1">Resolution</label>
                  <select value={resolution} onChange={(e) => setResolution(e.target.value)} className={inputClass}>
                    {meta.resolutions.map((r) => <option key={r} value={r}>{RESOLUTION_LABEL[r] ?? r}</option>)}
                  </select>
                  {resolution === 'referred_to_group' && (
                    <p className="text-[11.5px] text-muted mt-1.5">
                      The group's officers make the correction — this console does not change financial records.
                    </p>
                  )}
                </div>
              )}

              {target && (
                <>
                  <label className="block text-[11px] font-semibold uppercase text-muted mb-1">Note {target === 'resolved' ? '' : '(optional)'}</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass}
                    placeholder="What did you find? What was done?" />
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={submit} disabled={busy}
                      className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                      {busy ? 'Saving…' : `Confirm ${ACTION_LABEL[target].toLowerCase()}`}
                    </button>
                    <button onClick={() => { setTarget(null); setNote(''); }} className="text-[13px] font-semibold text-muted">Cancel</button>
                  </div>
                </>
              )}

              {error ? <div className="mt-3 rounded-lg bg-danger-bg text-danger text-[12.5px] px-3 py-2">{error}</div> : null}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-alt px-4 py-3 text-[13px] text-muted">This report is closed.</div>
          )}

          {/* History */}
          <div className="rounded-xl bg-surface border border-line p-4">
            <div className="text-[13px] font-semibold text-ink mb-3">History</div>
            {!report.events || report.events.length === 0 ? (
              <div className="text-[13px] text-muted">No steps recorded yet.</div>
            ) : (
              <ol className="space-y-3">
                {report.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-brand shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] text-ink">
                        {e.from_status ? `${STATUS_LABEL[e.from_status] ?? e.from_status} → ` : ''}
                        {STATUS_LABEL[e.to_status ?? ''] ?? e.to_status}
                      </div>
                      {e.note ? <div className="text-[12.5px] text-secondary mt-0.5 whitespace-pre-wrap">{e.note}</div> : null}
                      <div className="text-[11px] text-muted mt-0.5">{e.actor_name ?? 'System'} · {formatDateTime(e.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase text-muted">{label}</div>
      <div className="text-[13px] text-ink mt-0.5">{value ?? '—'}</div>
    </div>
  );
}
