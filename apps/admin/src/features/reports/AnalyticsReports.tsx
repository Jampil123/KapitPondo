/**
 * apps/admin/src/features/reports/AnalyticsReports.tsx — the Reports &
 * Analytics division of the Reports page (see ReportsPage.tsx for the tabs).
 * Generic renderer over GET /admin/reports (catalogue), /admin/reports/options
 * (filter dropdowns) and /admin/reports/:key (the run). The backend declares
 * each report's columns and which filters it supports, so this page shows the
 * right filter bar and table for any report without knowing them by name.
 *
 * Read-only: generate, read, export. Nothing here changes platform data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileText, Printer, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatPeso } from '../../lib/format';
import logo from '../../assets/images/KapitPondoL.png';
import { statusLabel } from './reportFormat';
import { ReportVisuals } from './ReportVisuals';

type Column = { key: string; label: string; type?: 'text' | 'number' | 'money' | 'date' | 'datetime' | 'status' };
type FilterName = 'date' | 'status' | 'group' | 'user' | 'action';

type StatusList = 'verification' | 'submission' | 'account' | 'group' | 'membership';

type ReportDef = {
  key: string;
  category: string;
  label: string;
  description: string;
  dateLabel: string;
  filters: FilterName[];
  statusOptions: StatusList | null;
  actionSource: 'system' | 'account' | 'group' | null;
  columns: Column[];
};

type Options = {
  groups: { id: string; name: string; fund_code: string; status: string }[];
  members: { id: string; name: string }[];
  actions: { system: string[]; account: string[]; group: string[] };
  statuses: Partial<Record<StatusList, string[]>>;
};

type Row = Record<string, unknown>;
type Report = {
  key: string;
  label: string;
  description: string;
  columns: Column[];
  rows: Row[];
  summary: Record<string, string | number>;
  row_count: number;
  truncated: boolean;
  generated_at: string;
};

type Filters = { from: string; to: string; status: string; group_id: string; member_id: string; action: string };
const EMPTY: Filters = { from: '', to: '', status: '', group_id: '', member_id: '', action: '' };

const STATUS_TONE: Record<string, string> = {
  verified: 'bg-success-bg text-success',
  active: 'bg-success-bg text-success',
  approved: 'bg-success-bg text-success',
  pending: 'bg-warning-bg text-warning',
  rejected: 'bg-danger-bg text-danger',
  defaulted: 'bg-danger-bg text-danger',
  suspended: 'bg-danger-bg text-danger',
  resubmission_required: 'bg-warning-bg text-warning',
};

// Quick date ranges — fill the from/to fields; the admin can still edit them.
function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DATE_PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Last 7 days', range: () => { const d = new Date(); d.setDate(d.getDate() - 6); return { from: isoDay(d), to: isoDay(new Date()) }; } },
  { label: 'Last 30 days', range: () => { const d = new Date(); d.setDate(d.getDate() - 29); return { from: isoDay(d), to: isoDay(new Date()) }; } },
  { label: 'This month', range: () => { const n = new Date(); return { from: isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), to: isoDay(n) }; } },
  { label: 'This year', range: () => { const n = new Date(); return { from: `${n.getFullYear()}-01-01`, to: isoDay(n) }; } },
];

function cell(value: unknown, type: Column['type']) {
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>;
  if (type === 'money') return formatPeso(value as string | number);
  if (type === 'date') return formatDate(value as string);
  if (type === 'datetime') return formatDateTime(value as string);
  if (type === 'status') {
    const key = String(value);
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[key] ?? 'bg-surface-alt text-muted'}`}>
        {statusLabel(key)}
      </span>
    );
  }
  if (type === 'number') return String(value);
  return String(value).replace(/^([0-9a-f]{8})-[0-9a-f-]{27}$/i, '$1…'); // shorten bare uuids
}

// Raw value for CSV — no JSX, no peso symbols, so it opens cleanly in Excel.
function csvValue(value: unknown) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(report: Report) {
  const header = report.columns.map((c) => csvValue(c.label)).join(',');
  const body = report.rows.map((r) => report.columns.map((c) => csvValue(r[c.key])).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// "Status: Pending · Fund group: Alpha" — printed under the report title.
function describeFilters(f: Filters, def: ReportDef | null, options: Options | null) {
  const parts: string[] = [];
  if (f.from || f.to) parts.push(`${def?.dateLabel ?? 'Date'}: ${f.from ? formatDate(f.from) : 'start'} – ${f.to ? formatDate(f.to) : 'today'}`);
  if (f.status) parts.push(`Status: ${statusLabel(f.status)}`);
  if (f.group_id) parts.push(`Fund group: ${options?.groups.find((g) => g.id === f.group_id)?.name ?? f.group_id}`);
  if (f.member_id) parts.push(`User: ${options?.members.find((m) => m.id === f.member_id)?.name ?? f.member_id}`);
  if (f.action) parts.push(`Action: ${statusLabel(f.action)}`);
  return parts.length ? parts.join(' · ') : 'All records';
}

const selectClass = 'w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand';
const labelClass = 'block text-[11px] font-semibold uppercase text-muted mb-1';

export function AnalyticsReports() {
  const [defs, setDefs] = useState<ReportDef[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catalogue + dropdown contents, once.
  useEffect(() => {
    Promise.allSettled([
      api.get<{ reports: ReportDef[] }>('/admin/reports'),
      api.get<{ options: Options }>('/admin/reports/options'),
    ]).then(([r, o]) => {
      if (r.status === 'fulfilled') {
        setDefs(r.value.reports);
        setSelected((prev) => prev ?? r.value.reports[0]?.key ?? null);
      }
      if (o.status === 'fulfilled') setOptions(o.value.options);
    });
  }, []);

  const def = useMemo(() => defs.find((d) => d.key === selected) ?? null, [defs, selected]);

  const run = useCallback(async (key: string, f: Filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v); });
      const r = await api.get<{ report: Report }>(`/admin/reports/${key}?${params.toString()}`);
      setReport(r.report);
      setError(null);
    } catch (e) {
      setReport(null);
      setError((e as Error).message || 'Could not generate this report.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate on report change and whenever a filter changes — the reports are
  // small aggregates, so there's no reason to make the admin click "apply".
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selected) run(selected, filters); }, [selected, filters, run]);

  const categories = useMemo(() => {
    const map = new Map<string, ReportDef[]>();
    defs.forEach((d) => map.set(d.category, [...(map.get(d.category) ?? []), d]));
    return [...map.entries()];
  }, [defs]);

  const has = (name: FilterName) => !!def?.filters.includes(name);
  const statusList = def?.statusOptions && options ? options.statuses[def.statusOptions] ?? [] : [];
  const actionList = def?.actionSource && options ? options.actions[def.actionSource] : [];

  return (
    // @container: the layout reacts to the width the sidebar leaves us.
    <div className="@container">
      <div className="grid grid-cols-1 @3xl:grid-cols-[260px_1fr] gap-6">
        {/* Report picker */}
        <div className="space-y-5 print:hidden">
          {categories.map(([category, items]) => (
            <div key={category}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{category}</div>
              <div className="space-y-1.5">
                {items.map((d) => (
                  <button key={d.key}
                    onClick={() => { setSelected(d.key); setFilters(EMPTY); }}
                    className={`w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${
                      selected === d.key ? 'bg-brand text-white font-semibold' : 'bg-surface border border-line text-ink hover:bg-surface-alt'
                    }`}>
                    <FileText size={15} className="mt-0.5 shrink-0" />
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Selected report */}
        <div className="min-w-0 space-y-5">
          {/* Printed letterhead — the on-screen filter card is hidden on paper */}
          <div className="hidden print:block border-b-2 border-ink pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src={logo} alt="" className="h-10 w-10 object-contain" />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-secondary">KapitPondo · System Report</div>
                  <h2 className="text-xl font-bold text-ink leading-tight">{report?.label ?? def?.label}</h2>
                </div>
              </div>
              <div className="text-right text-[11px] text-secondary">
                <div>Generated {report ? formatDateTime(report.generated_at) : ''}</div>
                <div>{report?.row_count ?? 0} record{report?.row_count === 1 ? '' : 's'}</div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-secondary">{report?.description ?? def?.description}</p>
            <p className="mt-1 text-[12px] text-ink"><span className="font-semibold">Filters:</span> {describeFilters(filters, def, options)}</p>
          </div>

          <div className="rounded-2xl bg-surface border border-line p-5 print:hidden">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{def?.label ?? 'Reports & Analytics'}</h2>
                <p className="text-[13px] text-muted mt-0.5">{def?.description ?? 'Pick a report to generate.'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setFilters(EMPTY)}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-muted hover:text-ink">
                  <RotateCcw size={14} /> Reset
                </button>
                <button onClick={() => window.print()} disabled={!report || report.rows.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:bg-surface-alt disabled:opacity-40">
                  <Printer size={15} /> Print / PDF
                </button>
                <button onClick={() => report && downloadCsv(report)} disabled={!report || report.rows.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                  <Download size={15} /> Export CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-5 gap-3">
              {has('date') && (
                <>
                  <div>
                    <label className={labelClass}>{def?.dateLabel} from</label>
                    <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className={selectClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{def?.dateLabel} to</label>
                    <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className={selectClass} />
                  </div>
                </>
              )}
              {has('status') && (
                <div>
                  <label className={labelClass}>Status</label>
                  <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={selectClass}>
                    <option value="">All statuses</option>
                    {statusList.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </div>
              )}
              {has('group') && (
                <div>
                  <label className={labelClass}>Fund group</label>
                  <select value={filters.group_id} onChange={(e) => setFilters((f) => ({ ...f, group_id: e.target.value }))} className={selectClass}>
                    <option value="">All fund groups</option>
                    {options?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}
              {has('user') && (
                <div>
                  <label className={labelClass}>User</label>
                  <select value={filters.member_id} onChange={(e) => setFilters((f) => ({ ...f, member_id: e.target.value }))} className={selectClass}>
                    <option value="">All users</option>
                    {options?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              {has('action') && (
                <div>
                  <label className={labelClass}>Action</label>
                  <select value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} className={selectClass}>
                    <option value="">All actions</option>
                    {actionList.map((a) => <option key={a} value={a}>{statusLabel(a)}</option>)}
                  </select>
                </div>
              )}
            </div>

            {has('date') && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {DATE_PRESETS.map((p) => {
                  const r = p.range();
                  const on = filters.from === r.from && filters.to === r.to;
                  return (
                    <button key={p.label} onClick={() => setFilters((f) => (on ? { ...f, from: '', to: '' } : { ...f, ...r }))}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${on ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted hover:text-ink'}`}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Headline numbers + charts */}
          {report && report.rows.length > 0 && !loading && <ReportVisuals report={report} />}

          {/* Rows */}
          <div className="rounded-2xl bg-surface border border-line overflow-x-auto print:overflow-visible print:rounded-none print:border-0">
            {report && report.rows.length > 0 && (
              <div className="px-4 pt-4 pb-1 text-[14px] font-semibold text-ink">Records</div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted bg-surface-alt/60">
                  {(report?.columns ?? def?.columns ?? []).map((c) => (
                    <th key={c.key} className={`px-4 py-3 font-medium whitespace-nowrap print:px-2 print:py-1.5 print:text-[10px] ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={99} className="px-5 py-10 text-center text-muted">Generating…</td></tr>
                ) : error ? (
                  <tr><td colSpan={99} className="px-5 py-10 text-center text-danger">{error}</td></tr>
                ) : !report || report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={99} className="px-5 py-10 text-center text-muted">
                      <BarChart3 size={28} className="mx-auto mb-2 opacity-40" />
                      No rows for these filters.
                    </td>
                  </tr>
                ) : report.rows.map((r, i) => (
                  <tr key={String(r.id ?? i)} className="border-b border-line last:border-0 even:bg-bg hover:bg-surface-alt/60 break-inside-avoid">
                    {report.columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 text-ink whitespace-nowrap print:whitespace-normal print:px-2 print:py-1.5 print:text-[10px] ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}>
                        {cell(r[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report && report.rows.length > 0 && (
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span>{report.row_count} row{report.row_count === 1 ? '' : 's'}{report.truncated ? ' (truncated)' : ''}</span>
              <span>Generated {formatDateTime(report.generated_at)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
