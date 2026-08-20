/**
 * apps/admin/src/features/system-health/StorageHealthPage.tsx
 * Capstone-demo "Storage Health" panel (module M10.2). Fully mock/simulated
 * data that fluctuates over time — a UI/UX prototype, no real storage/cloud
 * provider connection. Proof files back every financial claim in KapitPondo
 * (§0.2), so storage health is treated as a first-class monitoring surface.
 */
import { useEffect, useRef, useState } from 'react';
import {
  HardDrive, RefreshCw, SlidersHorizontal, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, Minus, ShieldAlert, Clock, AlertTriangle, Archive, Sparkles,
} from 'lucide-react';
import {
  seedSnapshot, tick, sweepOrphans, CATEGORY_ORDER,
  type StorageHealthSnapshot, type IncidentEntry, type DemoOverride,
  type MetricKey, type HealthStatus,
} from './storageHealthMock';

const TICK_MS = 6000;
const MAX_INCIDENTS = 50;

const STATUS_TONE: Record<HealthStatus, string> = {
  operational: 'bg-success-bg text-success',
  degraded: 'bg-warning-bg text-warning',
  down: 'bg-danger-bg text-danger',
};
const STATUS_STROKE: Record<HealthStatus, string> = {
  operational: 'var(--color-success)',
  degraded: 'var(--color-warning)',
  down: 'var(--color-danger)',
};
const STATUS_BORDER: Record<HealthStatus, string> = { operational: 'border-l-success', degraded: 'border-l-warning', down: 'border-l-danger' };
const STATUS_LABEL: Record<HealthStatus, string> = { operational: 'Operational', degraded: 'Degraded', down: 'Down' };

function StatusBadge({ status, size = 'md' }: { status: HealthStatus; size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${STATUS_TONE[status]} ${size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return <Minus size={13} className="text-muted" />;
  return diff > 0 ? <ArrowUp size={13} className="text-warning" /> : <ArrowDown size={13} className="text-success" />;
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

function Ring({ value, status }: { value: number; status: HealthStatus }) {
  const size = 60;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clamp01(value / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-alt)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={STATUS_STROKE[status]} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[12px] font-bold text-ink">{value.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function capacityBarColor(v: number) {
  if (v > 90) return 'bg-danger';
  if (v > 75) return 'bg-warning';
  if (v > 60) return 'bg-brand';
  return 'bg-success';
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

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

const OVERRIDE_METRICS: { key: MetricKey; label: string; allowDown: boolean }[] = [
  { key: 'uploadFailureRate', label: 'Upload Failure Rate', allowDown: true },
  { key: 'storageCapacity', label: 'Storage Capacity', allowDown: false },
  { key: 'retrievalLatency', label: 'Retrieval Latency', allowDown: false },
  { key: 'scanFailures', label: 'Scan Failures', allowDown: true },
];

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
          <div className="text-[11px] font-semibold text-secondary uppercase tracking-wide px-1 mb-2">Force a metric state</div>
          <div className="space-y-1">
            {OVERRIDE_METRICS.map((m) => (
              <div key={m.key} className="flex items-center justify-between px-1 py-1">
                <span className="text-[13px] text-ink">{m.label}</span>
                <div className="flex gap-1">
                  <button onClick={() => onSet({ scope: 'metric', metricKey: m.key, forcedStatus: 'degraded' })} className="rounded-md bg-warning-bg text-warning px-2 py-1 text-[11px] font-semibold">Degrade</button>
                  {m.allowDown ? (
                    <button onClick={() => onSet({ scope: 'metric', metricKey: m.key, forcedStatus: 'down' })} className="rounded-md bg-danger-bg text-danger px-2 py-1 text-[11px] font-semibold">Down</button>
                  ) : null}
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

function MetricShell({ status, children }: { status: HealthStatus; children: React.ReactNode }) {
  return <div className={`rounded-2xl bg-surface border border-line border-l-4 ${STATUS_BORDER[status]} p-5`}>{children}</div>;
}

export function StorageHealthPage() {
  const [snapshot, setSnapshot] = useState<StorageHealthSnapshot>(() => seedSnapshot());
  const [incidents, setIncidents] = useState<IncidentEntry[]>([]);
  const [override, setOverride] = useState<DemoOverride>({ scope: 'none' });
  const [refreshing, setRefreshing] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [sweepNote, setSweepNote] = useState<string | null>(null);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const overrideRef = useRef(override);
  overrideRef.current = override;

  function runTick() {
    const result = tick(snapshotRef.current, overrideRef.current);
    setSnapshot(result.snapshot);
    if (result.incidents.length > 0) {
      setIncidents((prev) => [...result.incidents.reverse(), ...prev].slice(0, MAX_INCIDENTS));
    }
  }

  useEffect(() => {
    const id = setInterval(runTick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    runTick();
    setTimeout(() => setRefreshing(false), 400);
  }
  function handleSetOverride(o: DemoOverride) {
    setOverride(o);
    setTimeout(runTick, 0);
  }
  function handleResetOverride() {
    setOverride({ scope: 'none' });
    setTimeout(runTick, 0);
  }
  function handleSweep() {
    setSweeping(true);
    setTimeout(() => {
      const { snapshot: next, swept } = sweepOrphans(snapshotRef.current);
      setSnapshot(next);
      setSweepNote(swept > 0 ? `Swept ${swept} orphaned file${swept === 1 ? '' : 's'} just now` : 'No orphaned files needed cleanup');
      setSweeping(false);
    }, 700);
  }

  const m = snapshot.metrics;

  return (
    <div className="mx-auto max-w-6xl px-8 pt-6 pb-8 space-y-6">
      <div className="rounded-2xl bg-surface border border-line p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${STATUS_TONE[snapshot.overallStatus]}`}>
            <HardDrive size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-ink">Storage Health</span>
              <StatusBadge status={snapshot.overallStatus} size="lg" />
            </div>
            <p className="text-xs text-muted mt-0.5">Last checked: {new Date(snapshot.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DemoControls override={override} onSet={handleSetOverride} onReset={handleResetOverride} />
          <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-2 text-xs font-semibold text-brand-dark disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricShell status={m.uploadFailureRate.status}>
          <div className="flex items-center gap-3.5">
            <Ring value={100 - m.uploadFailureRate.value} status={m.uploadFailureRate.status} />
            <div>
              <div className="text-xs text-secondary">Upload success rate</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-lg font-bold text-ink">{(100 - m.uploadFailureRate.value).toFixed(1)}%</span>
                <TrendArrow current={m.uploadFailureRate.value} previous={m.uploadFailureRate.previousValue} />
              </div>
              <div className="text-[10.5px] text-muted mt-0.5">{m.uploadFailureRate.value.toFixed(1)}% failing</div>
            </div>
          </div>
        </MetricShell>

        <MetricShell status={m.storageCapacity.status}>
          <div className="text-xs text-secondary">Storage capacity used</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-2xl font-bold text-ink">{m.storageCapacity.value.toFixed(1)}%</span>
            <TrendArrow current={m.storageCapacity.value} previous={m.storageCapacity.previousValue} />
          </div>
          <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden mt-3">
            <div className={`h-full rounded-full ${capacityBarColor(m.storageCapacity.value)}`} style={{ width: `${Math.min(100, m.storageCapacity.value)}%` }} />
          </div>
          <div className="text-[10.5px] text-muted mt-2">Warns above 75%</div>
        </MetricShell>

        <MetricShell status={m.retrievalLatency.status}>
          <div className="text-xs text-secondary">File retrieval latency</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-2xl font-bold text-ink">{m.retrievalLatency.value.toFixed(2)}s</span>
            <TrendArrow current={m.retrievalLatency.value} previous={m.retrievalLatency.previousValue} />
          </div>
          <div className="text-[10.5px] text-muted mt-3">Matters most during Auditor proof review</div>
        </MetricShell>

        <MetricShell status={m.scanFailures.status}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-secondary">Scan failures (24h)</div>
              <div className={`text-2xl font-bold mt-1 ${m.scanFailures.value > 0 ? 'text-danger' : 'text-ink'}`}>{Math.round(m.scanFailures.value)}</div>
            </div>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${STATUS_TONE[m.scanFailures.status]}`}>
              <ShieldAlert size={16} />
            </div>
          </div>
          <div className="text-[10.5px] text-muted mt-3">Blocked malformed/malicious uploads</div>
        </MetricShell>
      </div>

      <Card title="Uploads by proof type">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-line">
          {CATEGORY_ORDER.map((key, i) => {
            const c = snapshot.categories[key];
            return (
              <div key={key} className={`px-5 py-4 ${i > 0 ? 'sm:border-l border-line' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-secondary">{c.label}</span>
                  {c.elevated ? <span className="w-2 h-2 rounded-full bg-danger" title="Elevated failure rate" /> : null}
                </div>
                <div className="text-lg font-bold text-ink mt-1">{c.volume.toLocaleString()}</div>
                <div className={`text-[11px] mt-0.5 ${c.elevated ? 'text-danger font-semibold' : 'text-muted'}`}>{c.failureRate.toFixed(1)}% failing</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="rounded-2xl bg-surface border border-line p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-alt flex items-center justify-center text-brand-dark">
            <Archive size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">{snapshot.orphanedFiles} orphaned files</div>
            <p className="text-xs text-muted mt-0.5">
              {sweepNote ?? 'Uploaded but never linked to a ledger entry — informational, not a health signal'}
            </p>
          </div>
        </div>
        <button onClick={handleSweep} disabled={sweeping} className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-2 text-xs font-semibold text-brand-dark disabled:opacity-50">
          <Sparkles size={14} className={sweeping ? 'animate-pulse' : ''} />
          {sweeping ? 'Sweeping…' : 'Run cleanup sweep'}
        </button>
      </div>

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
