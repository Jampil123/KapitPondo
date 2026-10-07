/**
 * apps/admin/src/features/reports/ReportVisuals.tsx — headline numbers for a
 * generated report, plus a breakdown of its status column when it has one.
 */
import { formatPeso } from '../../lib/format';
import { statusLabel } from './reportFormat';

type VisualReport = {
  columns: { key: string; label: string; type?: string }[];
  rows: Record<string, unknown>[];
  summary: Record<string, string | number>;
};

export function ReportVisuals({ report }: { report: VisualReport }) {
  const statusCol = report.columns.find((c) => c.type === 'status');
  const counts = new Map<string, number>();
  if (statusCol) {
    for (const r of report.rows) {
      const v = r[statusCol.key];
      if (v == null || v === '') continue;
      counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
    }
  }
  const breakdown = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = breakdown[0]?.[1] ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {Object.entries(report.summary).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface border border-line px-4 py-3 min-w-[120px] break-inside-avoid">
            <div className="text-lg font-bold text-ink leading-tight">
              {typeof v === 'number' && /contribution|loan|balance/i.test(k) ? formatPeso(v) : v}
            </div>
            <div className="text-[11px] text-muted mt-0.5">{statusLabel(k)}</div>
          </div>
        ))}
      </div>

      {statusCol && breakdown.length > 1 && (
        <div className="rounded-2xl bg-surface border border-line p-4 break-inside-avoid">
          <div className="text-[14px] font-semibold text-ink mb-3">By {statusCol.label.toLowerCase()}</div>
          <div className="space-y-2">
            {breakdown.map(([status, n]) => (
              <div key={status} className="grid grid-cols-[140px_1fr_40px] items-center gap-3 text-[13px]">
                <div className="text-secondary truncate">{statusLabel(status)}</div>
                <div className="h-2.5 rounded-full bg-surface-alt overflow-hidden">
                  <div className="h-full rounded-full bg-brand print:bg-ink" style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <div className="text-right font-semibold text-ink tabular-nums">{n}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
