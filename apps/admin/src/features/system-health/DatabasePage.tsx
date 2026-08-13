/**
 * apps/admin/src/features/system-health/DatabasePage.tsx
 * Infra-level health for the Postgres database: reachability, size,
 * connections, cache hit ratio, and the largest tables.
 * Mirrors GET /admin/monitoring/database (services/api monitoring.service.js
 * `databaseHealth()`), which wraps the `database_health()` SQL function.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { Database as DatabaseIcon, Gauge, HardDrive, Plug, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';

type TableStat = {
  name: string;
  row_estimate: number;
  size_bytes: number;
  last_vacuum: string | null;
  last_analyze: string | null;
};

type DatabaseHealth = {
  reachable: boolean;
  latency_ms: number;
  error?: string;
  database_size_bytes?: number;
  connections?: { total: number; active: number; idle: number; max_connections: number };
  cache_hit_ratio?: number;
  tables?: TableStat[];
};

const TONE: Record<string, string> = {
  accent: 'bg-surface-alt text-brand-dark',
  ok: 'bg-success-bg text-success',
  warn: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
};

function formatBytes(bytes?: number) {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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

function connectionsTone(connections?: DatabaseHealth['connections']) {
  if (!connections || connections.max_connections === 0) return 'accent';
  const ratio = connections.total / connections.max_connections;
  if (ratio >= 0.8) return 'danger';
  if (ratio >= 0.5) return 'warn';
  return 'ok';
}

function cacheTone(ratio?: number) {
  if (ratio === undefined) return 'accent';
  if (ratio < 0.75) return 'danger';
  if (ratio < 0.9) return 'warn';
  return 'ok';
}

export function DatabasePage() {
  const [health, setHealth] = useState<DatabaseHealth | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ database: DatabaseHealth }>('/admin/monitoring/database');
      setHealth(r.database);
    } finally {
      setLoading(false);
    }
  }
  // Standard data-fetch-on-mount effect; setHealth runs after the awaited request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const kpis = [
    { label: 'Database size', value: formatBytes(health?.database_size_bytes), delta: 'Total on-disk size', icon: HardDrive, tone: 'accent' },
    {
      label: 'Connections',
      value: health?.connections ? `${health.connections.total}/${health.connections.max_connections}` : '—',
      delta: health?.connections ? `${health.connections.active} active, ${health.connections.idle} idle` : 'No data',
      icon: Plug,
      tone: connectionsTone(health?.connections),
    },
    {
      label: 'Cache hit ratio',
      value: health?.cache_hit_ratio !== undefined ? `${(health.cache_hit_ratio * 100).toFixed(1)}%` : '—',
      delta: 'Buffer cache efficiency',
      icon: Gauge,
      tone: cacheTone(health?.cache_hit_ratio),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-8 pt-6 pb-8 space-y-6">
      <div className="rounded-2xl bg-surface border border-line p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${health?.reachable === false ? TONE.danger : TONE.ok}`}>
            <DatabaseIcon size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">
              {health === null ? 'Checking…' : health.reachable ? 'Reachable' : 'Unreachable'}
            </div>
            <p className="text-xs text-muted">
              {health?.reachable
                ? `Responded in ${health.latency_ms}ms`
                : health?.error ?? 'Waiting for status…'}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-2 text-xs font-semibold text-brand-dark disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {health?.reachable !== false && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {kpis.map((k) => <Kpi key={k.label} {...k} />)}
        </div>
      )}

      {health?.reachable !== false && (
        <Card title="Largest tables">
          {!health?.tables || health.tables.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">No table statistics available.</div>
          ) : (
            <div className="divide-y divide-line">
              {health.tables.map((t) => (
                <div key={t.name} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">{t.name}</div>
                    <div className="text-[11px] text-muted">
                      {t.row_estimate.toLocaleString()} rows · last vacuum {formatDate(t.last_vacuum)}
                    </div>
                  </div>
                  <div className="text-[13px] text-ink shrink-0">{formatBytes(t.size_bytes)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
