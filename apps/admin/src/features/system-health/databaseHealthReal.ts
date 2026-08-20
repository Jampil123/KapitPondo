/**
 * apps/admin/src/features/system-health/databaseHealthReal.ts
 * Types + status/threshold logic for the Database Health page, backed by the
 * real GET /admin/monitoring/database endpoint (services/api monitoring
 * .service.js's `database_health()` RPC, extended in migration 0031).
 *
 * Query latency percentiles, backup timestamp, and replication lag are NOT
 * queryable in this environment (no pg_stat_statements, no Supabase
 * Management API token, no read replica configured) — they're shown as an
 * honest "not available" state rather than faked. See UNAVAILABLE_METRICS.
 */

export type HealthStatus = 'operational' | 'degraded' | 'down';
export type MetricKey = 'connectionPool' | 'diskUsage' | 'failedTransactions';

export type MetricReading = {
  key: MetricKey;
  label: string;
  value: number | null;
  unit: string;
  status: HealthStatus;
  previousValue: number | null;
  collecting?: boolean; // true when there isn't yet enough data (e.g. failed-tx window still filling)
};

export type UnavailableMetric = { key: string; label: string; reason: string };

export const UNAVAILABLE_METRICS: UnavailableMetric[] = [
  { key: 'queryLatency', label: 'Query Latency (p95/p99)', reason: 'Requires the pg_stat_statements extension, which isn’t enabled on this database.' },
  { key: 'lastBackup', label: 'Last Successful Backup', reason: 'Supabase manages backups outside Postgres; reading them needs a Management API token that isn’t configured.' },
  { key: 'replicationLag', label: 'Replication Lag', reason: 'No read replica is configured for this database, so there’s nothing to measure.' },
];

export type IncidentEntry = {
  id: string;
  timestamp: string;
  metricKey: MetricKey | 'reachability';
  metricLabel: string;
  fromStatus: HealthStatus;
  toStatus: HealthStatus;
  detail: string;
  triggeredByDemoOverride: boolean;
};

export type DemoOverride = { scope: 'none' | 'metric' | 'all'; metricKey?: MetricKey; forcedStatus?: 'degraded' | 'down' };

export type ConnectionsInfo = { total: number; active: number; idle: number; max_connections: number };
export type TableStat = { name: string; row_estimate: number; size_bytes: number; last_vacuum: string | null; last_analyze: string | null };

export type DatabaseHealthApiResponse = {
  reachable: boolean;
  latency_ms: number;
  error?: string;
  database_size_bytes?: number;
  connections?: ConnectionsInfo;
  cache_hit_ratio?: number;
  connection_pool_percent?: number | null;
  disk_usage_percent?: number;
  storage_capacity_bytes?: number;
  failed_transactions_recent?: number | null;
  failed_transactions_window_ms?: number;
  tables?: TableStat[];
};

export type DatabaseHealthSnapshot = {
  timestamp: string;
  reachable: boolean;
  error?: string;
  metrics: Record<MetricKey, MetricReading>;
  overallStatus: HealthStatus;
  storageCapacityBytes: number;
  failedTxWindowMs: number;
  connections?: ConnectionsInfo;
  databaseSizeBytes?: number;
  cacheHitRatio?: number;
  tables?: TableStat[];
};

const SEVERITY: Record<HealthStatus, number> = { operational: 0, degraded: 1, down: 2 };
export function worstOf(...statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), 'operational' as HealthStatus);
}

// Connection pool usage (%) — real, from pg_stat_activity vs max_connections.
function statusForPool(v: number): HealthStatus {
  if (v > 90) return 'down';
  if (v > 70) return 'degraded';
  return 'operational';
}

// Disk/storage usage (%) — real database size vs a configured capacity
// constant (Postgres has no built-in notion of provisioned volume size).
function statusForDisk(v: number): HealthStatus {
  if (v > 90) return 'down';
  if (v > 75) return 'degraded';
  return 'operational';
}

// Failed/rolled-back transactions in the tracked window — real cumulative
// pg_stat_database.xact_rollback, delta'd server-side over a rolling window.
function statusForFailedTx(v: number): HealthStatus {
  if (v > 20) return 'down';
  if (v > 5) return 'degraded';
  return 'operational';
}

function reading(key: MetricKey, label: string, value: number | null, unit: string, status: HealthStatus, previousValue: number | null, collecting = false): MetricReading {
  return { key, label, value, unit, status, previousValue, collecting };
}

export function mapSnapshot(api: DatabaseHealthApiResponse, prev: DatabaseHealthSnapshot | null): DatabaseHealthSnapshot {
  if (!api.reachable) {
    return {
      timestamp: new Date().toISOString(),
      reachable: false,
      error: api.error,
      metrics: prev?.metrics ?? emptyMetrics(),
      overallStatus: 'down',
      storageCapacityBytes: prev?.storageCapacityBytes ?? 0,
      failedTxWindowMs: prev?.failedTxWindowMs ?? 0,
    };
  }

  const poolValue = api.connection_pool_percent ?? null;
  const diskValue = api.disk_usage_percent ?? 0;
  const failedValue = api.failed_transactions_recent ?? null;
  const collectingFailedTx = failedValue === null;

  const metrics: Record<MetricKey, MetricReading> = {
    connectionPool: reading('connectionPool', 'Connection Pool Usage', poolValue, '%', poolValue === null ? 'operational' : statusForPool(poolValue), prev?.metrics.connectionPool.value ?? null),
    diskUsage: reading('diskUsage', 'Disk / Storage Usage', diskValue, '%', statusForDisk(diskValue), prev?.metrics.diskUsage.value ?? null),
    failedTransactions: reading('failedTransactions', 'Failed Transactions', failedValue, '', collectingFailedTx ? 'operational' : statusForFailedTx(failedValue as number), prev?.metrics.failedTransactions.value ?? null, collectingFailedTx),
  };

  return {
    timestamp: new Date().toISOString(),
    reachable: true,
    metrics,
    overallStatus: worstOf(metrics.connectionPool.status, metrics.diskUsage.status, metrics.failedTransactions.status),
    storageCapacityBytes: api.storage_capacity_bytes ?? 0,
    failedTxWindowMs: api.failed_transactions_window_ms ?? 0,
    connections: api.connections,
    databaseSizeBytes: api.database_size_bytes,
    cacheHitRatio: api.cache_hit_ratio,
    tables: api.tables,
  };
}

function emptyMetrics(): Record<MetricKey, MetricReading> {
  return {
    connectionPool: reading('connectionPool', 'Connection Pool Usage', null, '%', 'down', null),
    diskUsage: reading('diskUsage', 'Disk / Storage Usage', null, '%', 'down', null),
    failedTransactions: reading('failedTransactions', 'Failed Transactions', null, '', 'down', null),
  };
}

export function applyDemoOverride(snapshot: DatabaseHealthSnapshot, override: DemoOverride): DatabaseHealthSnapshot {
  if (override.scope === 'none' || !override.forcedStatus) return snapshot;

  const forced = override.forcedStatus;
  const shouldForce = (key: MetricKey) => override.scope === 'all' || override.metricKey === key;

  const metrics = { ...snapshot.metrics };
  (Object.keys(metrics) as MetricKey[]).forEach((key) => {
    if (!shouldForce(key)) return;
    metrics[key] = { ...metrics[key], status: forced, collecting: false };
  });

  return {
    ...snapshot,
    metrics,
    overallStatus: override.scope === 'all' ? forced : worstOf(metrics.connectionPool.status, metrics.diskUsage.status, metrics.failedTransactions.status),
  };
}

export function diffIncidents(prev: DatabaseHealthSnapshot, next: DatabaseHealthSnapshot, demoActive: boolean): IncidentEntry[] {
  const incidents: IncidentEntry[] = [];

  if (prev.reachable !== next.reachable) {
    incidents.push({
      id: `reachability-${Date.now()}`,
      timestamp: next.timestamp,
      metricKey: 'reachability',
      metricLabel: 'Database Reachability',
      fromStatus: prev.reachable ? 'operational' : 'down',
      toStatus: next.reachable ? 'operational' : 'down',
      detail: next.reachable ? 'Database is reachable again' : `Database became unreachable${next.error ? `: ${next.error}` : ''}`,
      triggeredByDemoOverride: false,
    });
  }

  (Object.keys(next.metrics) as MetricKey[]).forEach((key) => {
    const from = prev.metrics[key]?.status;
    const to = next.metrics[key].status;
    if (from && from !== to) {
      const m = next.metrics[key];
      incidents.push({
        id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: next.timestamp,
        metricKey: key,
        metricLabel: m.label,
        fromStatus: from,
        toStatus: to,
        detail: m.value !== null ? `${m.label} went from ${from} to ${to} (${m.value.toFixed(1)}${m.unit})` : `${m.label} went from ${from} to ${to}`,
        triggeredByDemoOverride: demoActive,
      });
    }
  });

  return incidents;
}
