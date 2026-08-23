/**
 * apps/admin/src/features/system-health/StorageHealthPage.tsx
 * "Storage Health" panel (module M10.2) — real data from GET
 * /admin/monitoring/storage (services/api monitoring.service.js,
 * storage_health() RPC, migration 0033). Polls periodically plus a manual
 * refresh, same pattern as Database Health.
 *
 * Upload success/failure rate and virus/malformed-file scan failures are not
 * obtainable in this environment (uploads bypass the backend entirely, and
 * no scanning step exists) — shown as an honest "not available" state
 * rather than simulated. Both were the only metrics allowed to reach "Down"
 * in the original status model, so overall status here caps at "Degraded".
 * See storageHealthReal.ts.
 */
import { useEffect, useRef, useState } from 'react';
import {
  HardDrive, RefreshCw, SlidersHorizontal, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, Minus, Clock, AlertTriangle, Info, WifiOff, Archive, Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  mapSnapshot, applyDemoOverride, diffIncidents, UNAVAILABLE_METRICS,
  CATEGORY_LABELS, CATEGORY_ORDER,
  type StorageHealthApiResponse, type StorageHealthSnapshot, type IncidentEntry,
  type DemoOverride, type MetricKey, type HealthStatus, type MetricReading,
} from './storageHealthReal';

const POLL_MS = 20000;
const MAX_INCIDENTS = 50;

const STATUS_TONE: Record<HealthStatus, string> = {
  operational: 'bg-success-bg text-success',
  degraded: 'bg-warning-bg text-warning',
  down: 'bg-danger-bg text-danger',
};
const STATUS_BAR: Record<HealthStatus, string> = { operational: 'bg-success', degraded: 'bg-warning', down: 'bg-danger' };
const STATUS_BORDER: Record<HealthStatus, string> = { operational: 'border-l-success', degraded: 'border-l-warning', down: 'border-l-danger' };
const STATUS_LABEL: Record<HealthStatus, string> = { operational: 'Operational', degraded: 'Degraded', down: 'Down' };

const METRIC_ORDER: MetricKey[] = ['storageCapacity', 'retrievalLatency'];
const OVERRIDE_LABELS: Record<MetricKey, string> = { storageCapacity: 'Storage Capacity', retrievalLatency: 'Retrieval Latency' };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(1)} ${units[i]}`;
}
function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
function capacityBarColor(v: number) {
  if (v > 90) return 'bg-danger';
  if (v > 75) return 'bg-warning';
  if (v > 60) return 'bg-brand';
  return 'bg-success';
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
  if (Math.abs(diff) < 0.02) return <Minus size={13} className="text-muted" />;
  return diff > 0 ? <ArrowUp size={13} className="text-warning" /> : <ArrowDown size={13} className="text-success" />;
}

function MetricCard({ metric, sub, children }: { metric: MetricReading; sub?: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl bg-surface border border-line border-l-4 ${STATUS_BORDER[metric.status]} p-5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-secondary truncate">{metric.label}</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-ink">
              {metric.collecting || metric.value === null ? '—' : `${metric.value.toFixed(metric.unit === 's' ? 2 : 1)}${metric.unit}`}
            </span>
          </div>
        </div>
        <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${STATUS_TONE[metric.status]}`}>
          <TrendArrow current={metric.value} previous={metric.previousValue} />
        </div>
      </div>
      {children}
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
        <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-surface-alt text-muted"><Info size={16} /></div>
      </div>
      <div className="text-[11px] text-muted mt-3.5">{reason}</div>
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

function DemoControls({ override, onSet, onReset }: { override: DemoOverride; onSet: (o: DemoOverride) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${override.scope !== 'none' ? 'bg-warning-bg text-warning' : 'bg-surface-alt text-brand-dark'}`}
      >
        <SlidersHorizontal size={14} />
        Demo controls
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface border border-line shadow-lg z-10 p-3">
          <div className="text-[11px] text-muted px-1 mb-2">Only capacity and latency are real, so only these can be forced (Degraded only — both are capped, per the status model).</div>
          <div className="space-y-1">
            {METRIC_ORDER.map((key) => (
              <div key={key} className="flex items-center justify-between px-1 py-1">
                <span className="text-[13px] text-ink">{OVERRIDE_LABELS[key]}</span>
                <button onClick={() => onSet({ scope: 'metric', metricKey: key, forcedStatus: 'degraded' })} className="rounded-md bg-warning-bg text-warning px-2 py-1 text-[11px] font-semibold">Degrade</button>
              </div>
            ))}
          </div>
          <div className="border-t border-line mt-3 pt-3 space-y-1.5">
            <button onClick={() => onSet({ scope: 'all', forcedStatus: 'degraded' })} className="w-full rounded-md bg-warning-bg text-warning px-2 py-1.5 text-[11px] font-semibold">All degraded</button>
            <button onClick={onReset} className="w-full rounded-md bg-surface-alt text-brand-dark px-2 py-1.5 text-[11px] font-semibold">Reset to normal</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StorageHealthPage() {
  const [displaySnapshot, setDisplaySnapshot] = useState<StorageHealthSnapshot | null>(null);
  const [incidents, setIncidents] = useState<IncidentEntry[]>([]);
  const [override, setOverride] = useState<DemoOverride>({ scope: 'none' });
  const [loading, setLoading] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [sweepNote, setSweepNote] = useState<string | null>(null);

  const rawSnapshotRef = useRef<StorageHealthSnapshot | null>(null);
  const displaySnapshotRef = useRef<StorageHealthSnapshot | null>(null);
  const overrideRef = useRef(override);
  overrideRef.current = override;

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ storage: StorageHealthApiResponse }>('/admin/monitoring/storage');
      const rawNext = mapSnapshot(r.storage, rawSnapshotRef.current);
      rawSnapshotRef.current = rawNext;

      const displayNext = applyDemoOverride(rawNext, overrideRef.current);
      if (displaySnapshotRef.current) {
        const found = diffIncidents(displaySnapshotRef.current, displayNext, overrideRef.current.scope !== 'none');
        if (found.length > 0) setIncidents((prev) => [...found.reverse(), ...prev].slice(0, MAX_INCIDENTS));
      }
      displaySnapshotRef.current = displayNext;
      setDisplaySnapshot(displayNext);
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
            <HardDrive size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-ink">Storage Health</span>
              {snapshot ? <StatusBadge status={snapshot.overallStatus} size="lg" /> : null}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {snapshot ? `Last checked: ${new Date(snapshot.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Checking…'}
              {' · Caps at Degraded — Upload Failure Rate and Scan Failures aren’t available in this environment'}
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
            <div className="text-sm font-semibold text-danger">Storage unreachable</div>
            <p className="text-xs text-danger/80 mt-0.5">{snapshot.error ?? 'The health check could not reach storage.'}</p>
          </div>
        </div>
      ) : null}

      {snapshot && snapshot.reachable !== false ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard metric={snapshot.metrics.storageCapacity} sub={`${formatBytes(snapshot.totalBytes)} of ${formatBytes(snapshot.storageCapacityBytes)} configured capacity`}>
              <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden mt-3.5">
                <div className={`h-full rounded-full ${capacityBarColor(snapshot.metrics.storageCapacity.value ?? 0)}`} style={{ width: `${Math.min(100, snapshot.metrics.storageCapacity.value ?? 0)}%` }} />
              </div>
            </MetricCard>
            <MetricCard
              metric={snapshot.metrics.retrievalLatency}
              sub={snapshot.metrics.retrievalLatency.collecting ? 'No uploaded file to sample yet' : 'Timed against the most recently uploaded file'}
            />
            {UNAVAILABLE_METRICS.map((m) => <UnavailableCard key={m.key} label={m.label} reason={m.reason} />)}
          </div>

          <Card title="Uploads by proof type">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-line">
              {CATEGORY_ORDER.map((key, i) => (
                <div key={key} className={`px-5 py-4 ${i > 0 ? 'sm:border-l border-line' : ''}`}>
                  <div className="text-[11px] text-secondary">{CATEGORY_LABELS[key]}</div>
                  <div className="text-lg font-bold text-ink mt-1">{snapshot.categoryVolume[key].toLocaleString()}</div>
                  <div className="text-[11px] text-muted mt-0.5">linked files</div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 text-[10.5px] text-muted border-t border-line">
              Volume only — per-category failure rate isn't available (see Upload Failure Rate above).
            </div>
          </Card>

          <div className="rounded-2xl bg-surface border border-line p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-alt flex items-center justify-center text-brand-dark"><Archive size={18} /></div>
              <div>
                <div className="text-sm font-semibold text-ink">{snapshot.orphanedFiles} orphaned files</div>
                <p className="text-xs text-muted mt-0.5">
                  {sweepNote ?? 'Uploaded but not referenced by any members/contributions/loan_payments/expenses row — informational, not a health signal'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSweepNote(`This would remove ${snapshot.orphanedFiles} file${snapshot.orphanedFiles === 1 ? '' : 's'} — deletion isn't implemented in this prototype to avoid touching real storage`)}
              className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-2 text-xs font-semibold text-brand-dark"
            >
              <Sparkles size={14} />
              Preview cleanup
            </button>
          </div>
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
