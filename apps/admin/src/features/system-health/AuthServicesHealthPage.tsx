/**
 * apps/admin/src/features/system-health/AuthServicesHealthPage.tsx
 * "Auth Services Health" panel (module M10.2). Only the ID Verification
 * Queue column is real data — GET /admin/monitoring/verification-queue
 * (services/api monitoring.service.js, verification_queue_health() RPC,
 * migration 0032). OTP/SMS and Login/Session have no underlying system to
 * read from in this codebase (no SMS/OTP integration, login bypasses this
 * backend entirely via Supabase Auth's client SDK) — they're shown as an
 * honest "not available" state rather than simulated. See
 * authServicesHealthReal.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, RefreshCw, SlidersHorizontal, ChevronDown, ChevronUp,
  ListChecks, Clock, AlertTriangle, ArrowRight, Info,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  mapSnapshot, applyDemoOverride, diffIncidents, UNAVAILABLE_METRICS,
  type VerificationQueueApiResponse, type AuthServicesSnapshot, type IncidentEntry,
  type DemoOverride, type HealthStatus,
} from './authServicesHealthReal';

const POLL_MS = 20000;
const MAX_INCIDENTS = 50;

const STATUS_TONE: Record<HealthStatus, string> = {
  operational: 'bg-success-bg text-success',
  degraded: 'bg-warning-bg text-warning',
  down: 'bg-danger-bg text-danger',
};
const STATUS_LABEL: Record<HealthStatus, string> = { operational: 'Operational', degraded: 'Degraded', down: 'Down' };
const NOT_CONFIGURED_TONE = 'bg-surface-alt text-muted';

function StatusBadge({ status, size = 'md' }: { status: HealthStatus; size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${STATUS_TONE[status]} ${size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function NotConfiguredBadge() {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${NOT_CONFIGURED_TONE}`}>Not configured</span>;
}

function Card({ title, tone, action, children }: { title: string; tone?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl bg-surface border border-line ${tone ?? ''}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      <div className="p-5 space-y-3.5">{children}</div>
    </div>
  );
}

function UnavailableRow({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 shrink-0 rounded-lg bg-surface-alt text-muted flex items-center justify-center mt-0.5">
        <Info size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] text-muted mt-0.5">{reason}</div>
      </div>
    </div>
  );
}

function ageColor(hours: number) {
  if (hours > 48) return 'text-danger';
  if (hours > 24) return 'text-warning';
  return 'text-success';
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function DemoControls({ override, onSet, onReset }: {
  override: DemoOverride;
  onSet: (o: DemoOverride) => void;
  onReset: () => void;
}) {
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
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface border border-line shadow-lg z-10 p-3 space-y-2">
          <div className="text-[11px] text-muted px-1 mb-1">
            Only the Verification Queue is real data, so it's the only column that can be forced — visually only, doesn't touch real accounts.
          </div>
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[13px] text-ink">Queue depth</span>
            <button onClick={() => onSet({ scope: 'metric', metricKey: 'queueDepth', forcedStatus: 'degraded' })} className="rounded-md bg-warning-bg text-warning px-2 py-1 text-[11px] font-semibold">Degrade</button>
          </div>
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[13px] text-ink">Oldest item age</span>
            <button onClick={() => onSet({ scope: 'metric', metricKey: 'oldestPendingAge', forcedStatus: 'degraded' })} className="rounded-md bg-warning-bg text-warning px-2 py-1 text-[11px] font-semibold">Degrade</button>
          </div>
          <div className="border-t border-line pt-2 mt-1">
            <button onClick={onReset} className="w-full rounded-md bg-surface-alt text-brand-dark px-2 py-1.5 text-[11px] font-semibold">Reset to normal</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AuthServicesHealthPage() {
  const navigate = useNavigate();
  const [displaySnapshot, setDisplaySnapshot] = useState<AuthServicesSnapshot | null>(null);
  const [incidents, setIncidents] = useState<IncidentEntry[]>([]);
  const [override, setOverride] = useState<DemoOverride>({ scope: 'none' });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const rawSnapshotRef = useRef<AuthServicesSnapshot | null>(null);
  const displaySnapshotRef = useRef<AuthServicesSnapshot | null>(null);
  const overrideRef = useRef(override);
  overrideRef.current = override;

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ queue: VerificationQueueApiResponse }>('/admin/monitoring/verification-queue');
      const rawNext = mapSnapshot(r.queue, rawSnapshotRef.current);
      rawSnapshotRef.current = rawNext;

      const displayNext = applyDemoOverride(rawNext, overrideRef.current);
      if (displaySnapshotRef.current) {
        const found = diffIncidents(displaySnapshotRef.current, displayNext, overrideRef.current.scope !== 'none');
        if (found.length > 0) setIncidents((prev) => [...found.reverse(), ...prev].slice(0, MAX_INCIDENTS));
      }
      displaySnapshotRef.current = displayNext;
      setDisplaySnapshot(displayNext);
      setLoadError(false);
    } catch {
      // Keep showing the last known snapshot rather than flipping status —
      // a transient fetch error isn't itself a queue-severity signal.
      setLoadError(true);
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
  const otpMetrics = UNAVAILABLE_METRICS.filter((m) => m.subPanel === 'otp');
  const loginMetrics = UNAVAILABLE_METRICS.filter((m) => m.subPanel === 'login');

  return (
    <div className="mx-auto max-w-7xl px-8 pt-6 pb-8 space-y-6">
      <div className="rounded-2xl bg-surface border border-line p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${snapshot ? STATUS_TONE[snapshot.status] : 'bg-surface-alt text-brand-dark'}`}>
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-ink">Auth Services</span>
              {snapshot ? <StatusBadge status={snapshot.status} size="lg" /> : null}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {snapshot ? `Last checked: ${new Date(snapshot.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Checking…'}
              {loadError ? ' · Last refresh failed, showing previous data' : ''}
              {' · Reflects the ID Verification Queue only (OTP/SMS and Login/Session aren’t available in this environment)'}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Column A — OTP / SMS Gateway */}
        <Card title="OTP / SMS Gateway" tone="border-t-4 border-t-brand" action={<NotConfiguredBadge />}>
          {otpMetrics.map((m) => <UnavailableRow key={m.key} label={m.label} reason={m.reason} />)}
        </Card>

        {/* Column B — Login & Session */}
        <Card title="Login & Session" tone="border-t-4 border-t-secondary" action={<NotConfiguredBadge />}>
          {loginMetrics.map((m) => <UnavailableRow key={m.key} label={m.label} reason={m.reason} />)}
        </Card>

        {/* Column C — ID Verification Queue (real data) */}
        <Card title="ID Verification Queue" tone="border-t-4 border-t-success" action={snapshot ? <StatusBadge status={snapshot.status} /> : null}>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-surface-alt flex items-center justify-center shrink-0">
              <ListChecks size={18} className="text-brand-dark" />
            </div>
            <div>
              <div className="text-2xl font-bold text-ink leading-none">{snapshot ? Math.round(snapshot.metrics.queueDepth.value ?? 0) : '—'}</div>
              <div className="text-[11px] text-secondary mt-1">pending accounts</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-secondary">Oldest pending item</span>
            <span className={`text-sm font-semibold ${snapshot?.metrics.oldestPendingAge.value != null ? ageColor(snapshot.metrics.oldestPendingAge.value) : 'text-muted'}`}>
              {snapshot?.metrics.oldestPendingAge.value != null ? `${snapshot.metrics.oldestPendingAge.value.toFixed(1)}h` : '—'}
            </span>
          </div>

          <div>
            <div className="text-[11px] text-secondary">Avg review turnaround (7d)</div>
            <div className="text-xl font-bold text-ink mt-0.5">
              {snapshot && snapshot.avgTurnaroundHours !== null ? `${(snapshot.avgTurnaroundHours / 24).toFixed(1)}d` : '—'}
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {snapshot ? `Based on ${snapshot.turnaroundSampleSize} decision${snapshot.turnaroundSampleSize === 1 ? '' : 's'} in the last 7 days` : ''}
            </div>
          </div>

          <button
            onClick={() => navigate('/verifications')}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            Go to verification queue <ArrowRight size={14} />
          </button>
        </Card>
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
            <div className="py-6 text-center text-muted text-sm">No incidents recorded — verification queue operational.</div>
          ) : (
            <div className="-m-5 divide-y divide-line max-h-96 overflow-y-auto">
              {incidents.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3.5 px-5 py-3">
                  <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${STATUS_TONE[entry.toStatus]}`}>
                    <AlertTriangle size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink">
                      {entry.detail}
                      {entry.triggeredByDemoOverride ? ' · Manual' : ''}
                    </div>
                    <div className="text-[11px] text-muted">ID Verification Queue · {entry.fromStatus} → {entry.toStatus}</div>
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
