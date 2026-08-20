/**
 * apps/admin/src/features/system-health/DatabaseHealthPage.tsx
 * "Database Health" panel (module M10.2) — real data from GET
 * /admin/monitoring/database (services/api monitoring.service.js,
 * database_health() RPC extended in migration 0031). Polls periodically so
 * the page updates on its own, plus a manual refresh.
 *
 * Query latency percentiles, backup timestamp, and replication lag are not
 * obtainable in this environment (no pg_stat_statements extension, no
 * Supabase Management API token, no read replica) — shown as an honest
 * "not available" state rather than simulated. See databaseHealthReal.ts.
 */
import { useEffect, useRef, useState } from 'react';
import {
  HeartPulse, RefreshCw, SlidersHorizontal, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, Minus, Clock, AlertTriangle, Info, WifiOff,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  mapSnapshot, applyDemoOverride, diffIncidents, UNAVAILABLE_METRICS,
  type DatabaseHealthApiResponse, type DatabaseHealthSnapshot, type IncidentEntry,
  type DemoOverride, type MetricKey, type HealthStatus, type MetricReading,
} from './databaseHealthReal';

const POLL_MS = 20000;
const MAX_INCIDENTS = 50;
const MAX_POOL_HISTORY = 60;

const STATUS_TONE: Record<HealthStatus, string> = {
  operational: 'bg-success-bg text-success',
  degraded: 'bg-warning-bg text-warning',
  down: 'bg-danger-bg text-danger',
};
const STATUS_BAR: Record<HealthStatus, string> = { operational: 'bg-success', degraded: 'bg-warning', down: 'bg-danger' };
const STATUS_BORDER: Record<HealthStatus, string> = { operational: 'border-l-success', degraded: 'border-l-warning', down: 'border-l-danger' };
const STATUS_LABEL: Record<HealthStatus, string> = { operational: 'Operational', degraded: 'Degraded', down: 'Down' };

const METRIC_ORDER: MetricKey[] = ['connectionPool', 'diskUsage', 'failedTransactions'];
const OVERRIDE_LABELS: Record<MetricKey, string> = { connectionPool: 'Connection Pool', diskUsage: 'Disk Usage', failedTransactions: 'Failed Transactions' };

type PoolHistoryPoint = { timestamp: string; value: number };

function formatBytes(bytes?: number) {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(1)} ${units[i]}`;
}

function formatWindow(ms: number) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 6) / 10}h`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function StatusBadge({ status, size = 'md' }: { status: HealthStatus; size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${STATUS_TONE[status]} ${size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function TrendArrow({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return <Minus size={13} className="text-muted" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return <Minus size={13} className="text-muted" />;
  return diff > 0 ? <ArrowUp size={13} className="text-warning" /> : <ArrowDown size={13} className="text-success" />;
}

function MetricCard({ metric, sub }: { metric: MetricReading; sub?: string }) {
  return (
    <div className={`rounded-2xl bg-surface border border-line border-l-4 ${STATUS_BORDER[metric.status]} p-5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-secondary truncate">{metric.label}</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-ink">
              {metric.collecting ? '—' : metric.value !== null ? `${metric.value.toFixed(1)}${metric.unit}` : '—'}
            </span>
          </div>
        </div>
        <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${STATUS_TONE[metric.status]}`}>
          <TrendArrow current={metric.value} previous={metric.previousValue} />
        </div>
      </div>

      {metric.unit === '%' ? (
        <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden mt-3.5">
          <div className={`h-full rounded-full ${STATUS_BAR[metric.status]}`} style={{ width: `${Math.min(100, metric.value ?? 0)}%` }} />
        </div>
      ) : null}

      <div className="text-[11px] text-muted mt-3.5">{sub ?? (metric.status === 'operational' ? 'Within normal range' : `${STATUS_LABEL[metric.status]} — check thresholds`)}</div>
    </div>
  );
}

function UnavailableCard({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-line border-l-4 border-l-line-strong p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-secondary truncate">{label}</div>
          <div className="text-lg font-bold text-muted mt-1">Not available</div>
        </div>
        <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-surface-alt text-muted">
          <Info size={16} />
        </div>
      </div>
      <div className="text-[11px] text-muted mt-3.5">{reason}</div>
    </div>
  );
}

function PoolSparkline({ points }: { points: PoolHistoryPoint[] }) {
  const width = 280;
  const height = 56;
  if (points.length < 2) {
    return <div className="h-14 flex items-center justify-center text-[11px] text-muted">Collecting samples as the page stays open…</div>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = Math.max(max - min, 1);
  const toXY = (v: number, i: number) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.075;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const line = points.map((p, i) => toXY(p.value, i)).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-14" preserveAspectRatio="none">
      <polyline points={line} fill="none" stroke="var(--color-brand-dark)" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
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

function DemoControls({ override, onSet, onReset }: { override: DemoOverride; onSet: (o: DemoOverride) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${override.scope !== 'none' ? 'bg-danger-bg text-danger' : 'bg-surface-alt text-brand-dark'}`}
      >
        <SlidersHorizontal size={14} />
        Demo controls
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface border border-line shadow-lg z-10 p-3">
          <div className="text-[11px] text-muted px-1 mb-2">Visually forces a status for the capstone defense — does not change the real database.</div>
          <div className="text-[11px] font-semibold text-secondary uppercase tracking-wide px-1 mb-2">Force a metric state</div>
          <div className="space-y-1">
            {METRIC_ORDER.map((key) => (
              <div key={key} className="flex items-center justify-between px-1 py-1">
                <span className="text-[13px] text-ink">{OVERRIDE_LABELS[key]}</span>
                <div className="flex gap-1">
                  <button onClick={() => onSet({ scope: 'metric', metricKey: key, forcedStatus: 'degraded' })} className="rounded-md bg-warning-bg text-warning px-2 py-1 text-[11px] font-semibold">Degrade</button>
                  <button onClick={() => onSet({ scope: 'metric', metricKey: key, forcedStatus: 'down' })} className="rounded-md bg-danger-bg text-danger px-2 py-1 text-[11px] font-semibold">Down</button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-line mt-3 pt-3 space-y-1.5">
            <div className="text-[11px] font-semibold text-secondary uppercase tracking-wide px-1 mb-1">Force everything</div>
            <div className="flex gap-1.5 px-1">
              <button onClick={() => onSet({ scope: 'all', forcedStatus: 'degraded' })} className="flex-1 rounded-md bg-warning-bg text-warning px-2 py-1.5 text-[11px] font-semibold">All degraded</button>
              <button onClick={() => onSet({ scope: 'all', forcedStatus: 'down' })} className="flex-1 rounded-md bg-danger-bg text-danger px-2 py-1.5 text-[11px] font-semibold">All down</button>
            </div>
            <button onClick={onReset} className="w-full rounded-md bg-surface-alt text-brand-dark px-2 py-1.5 text-[11px] font-semibold mt-1">Reset to normal</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DatabaseHealthPage() {
  const [displaySnapshot, setDisplaySnapshot] = useState<DatabaseHealthSnapshot | null>(null);
  const [poolHistory, setPoolHistory] = useState<PoolHistoryPoint[]>([]);
  const [incidents, setIncidents] = useState<IncidentEntry[]>([]);
  const [override, setOverride] = useState<DemoOverride>({ scope: 'none' });
  const [loading, setLoading] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const rawSnapshotRef = useRef<DatabaseHealthSnapshot | null>(null);
  const displaySnapshotRef = useRef<DatabaseHealthSnapshot | null>(null);
  const overrideRef = useRef(override);
  overrideRef.current = override;

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ database: DatabaseHealthApiResponse }>('/admin/monitoring/database');
      const rawNext = mapSnapshot(r.database, rawSnapshotRef.current);
      rawSnapshotRef.current = rawNext;

      const displayNext = applyDemoOverride(rawNext, overrideRef.current);
      if (displaySnapshotRef.current) {
        const found = diffIncidents(displaySnapshotRef.current, displayNext, overrideRef.current.scope !== 'none');
        if (found.length > 0) setIncidents((prev) => [...found.reverse(), ...prev].slice(0, MAX_INCIDENTS));
      }
      displaySnapshotRef.current = displayNext;
      setDisplaySnapshot(displayNext);

      if (rawNext.reachable && rawNext.metrics.connectionPool.value !== null) {
        setPoolHistory((prev) => [...prev.slice(-(MAX_POOL_HISTORY - 1)), { timestamp: rawNext.timestamp, value: rawNext.metrics.connectionPool.value as number }]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyOverride(next: DemoOverride) {
    setOverride(next);
    if (!rawSnapshotRef.current) return;
    const displayNext = applyDemoOverride(rawSnapshotRef.current, next);
    if (displaySnapshotRef.current) {
      const found = diffIncidents(displaySnapshotRef.current, displayNext, next.scope !== 'none');
      if (found.length > 0) setIncidents((prev) => [...found.reverse(), ...prev].slice(0, MAX_INCIDENTS));
    }
    displaySnapshotRef.current = displayNext;
    setDisplaySnapshot(displayNext);
  }

  const snapshot = displaySnapshot;

  return (
    <div className="mx-auto max-w-6xl px-8 pt-6 pb-8 space-y-6">
      <div className="rounded-2xl bg-surface border border-line p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${snapshot ? STATUS_TONE[snapshot.overallStatus] : 'bg-surface-alt text-brand-dark'}`}>
            <HeartPulse size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-ink">Database Health</span>
              {snapshot ? <StatusBadge status={snapshot.overallStatus} size="lg" /> : null}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {snapshot ? `Last checked: ${new Date(snapshot.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Checking…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DemoControls override={override} onSet={applyOverride} onReset={() => applyOverride({ scope: 'none' })} />
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-2 text-xs font-semibold text-brand-dark disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {snapshot?.reachable === false ? (
        <div className="rounded-2xl bg-danger-bg border border-line p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-danger"><WifiOff size={18} /></div>
          <div>
            <div className="text-sm font-semibold text-danger">Database unreachable</div>
            <p className="text-xs text-danger/80 mt-0.5">{snapshot.error ?? 'The health check could not reach the database.'}</p>
          </div>
        </div>
      ) : null}

      {snapshot && snapshot.reachable !== false ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              metric={snapshot.metrics.connectionPool}
              sub={snapshot.connections ? `${snapshot.connections.total} of ${snapshot.connections.max_connections} connections` : undefined}
            />
            <MetricCard
              metric={snapshot.metrics.diskUsage}
              sub={snapshot.databaseSizeBytes !== undefined ? `${formatBytes(snapshot.databaseSizeBytes)} of ${formatBytes(snapshot.storageCapacityBytes)} configured capacity` : undefined}
            />
            <MetricCard
              metric={snapshot.metrics.failedTransactions}
              sub={snapshot.metrics.failedTransactions.collecting ? `Collecting data (${formatWindow(snapshot.failedTxWindowMs)} of 1h so far)` : `In the last ${formatWindow(snapshot.failedTxWindowMs)}`}
            />
            {UNAVAILABLE_METRICS.map((m) => <UnavailableCard key={m.key} label={m.label} reason={m.reason} />)}
          </div>

          <Card title="Connection pool usage — this session">
            <div className="px-5 py-4">
              <PoolSparkline points={poolHistory} />
              <p className="text-[10.5px] text-muted mt-2">
                Sampled live from real polls of this page (every {POLL_MS / 1000}s) — not a persisted 24h history, since there's no time-series store for this metric yet.
              </p>
            </div>
          </Card>
        </>
      ) : null}

      <Card
        title="Incident log"
        action={
          <button onClick={() => setLogExpanded((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-brand-dark">
            {incidents.length} {incidents.length === 1 ? 'entry' : 'entries'}
            {logExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        }
      >
        {logExpanded ? (
          incidents.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">No incidents recorded — all metrics operational.</div>
          ) : (
            <div className="divide-y divide-line max-h-96 overflow-y-auto">
              {incidents.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3.5 px-5 py-3">
                  <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${STATUS_TONE[entry.toStatus]}`}>
                    <AlertTriangle size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink">{entry.detail}{entry.triggeredByDemoOverride ? ' · Manual' : ''}</div>
                    <div className="text-[11px] text-muted">{entry.metricLabel} · {entry.fromStatus} → {entry.toStatus}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap shrink-0">
                    <Clock size={13} /> {formatRelative(entry.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </Card>
    </div>
  );
}
