/**
 * apps/admin/src/features/system-health/storageHealthReal.ts
 * Types + status logic for the Storage Health page, backed by the real
 * GET /admin/monitoring/storage endpoint (services/api monitoring.service.js,
 * storage_health() RPC, migration 0033).
 *
 * Upload success/failure rate and virus/malformed-file scan failures are NOT
 * obtainable in this environment — uploads go straight from the mobile
 * client to Supabase Storage (the backend never sees the attempt), and no
 * scanning step exists anywhere in the upload pipeline. They're shown as an
 * honest "not available" state rather than faked. Because both are the only
 * two metrics allowed to reach "Down" in the original status model, overall
 * status here can now only ever be Operational or Degraded.
 */

export type HealthStatus = 'operational' | 'degraded' | 'down';
export type MetricKey = 'storageCapacity' | 'retrievalLatency';
export type ProofCategory = 'idVerification' | 'contributionProof' | 'loanReference' | 'expenseReceipt';

export type MetricReading = {
  key: MetricKey;
  label: string;
  value: number | null;
  unit: string;
  status: HealthStatus;
  previousValue: number | null;
  collecting?: boolean;
};

export type UnavailableMetric = { key: string; label: string; reason: string };

export const UNAVAILABLE_METRICS: UnavailableMetric[] = [
  { key: 'uploadFailureRate', label: 'Upload Failure Rate', reason: 'Uploads go straight from the mobile client to Supabase Storage — this backend never sees the attempt, so there’s nothing to log success/failure against.' },
  { key: 'scanFailures', label: 'Scan Failures (24h)', reason: 'No malware/format validation step exists in the upload pipeline yet — there’s no scan to fail.' },
];

export const CATEGORY_LABELS: Record<ProofCategory, string> = {
  idVerification: 'ID Verification',
  contributionProof: 'Contribution Proof',
  loanReference: 'Loan Reference',
  expenseReceipt: 'Expense Receipt',
};
export const CATEGORY_ORDER: ProofCategory[] = ['idVerification', 'contributionProof', 'loanReference', 'expenseReceipt'];

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

// Both real metrics are capped at 'degraded' per the status model — a full
// bucket or slow reads are problems to plan around, not outages.
export type DemoOverride = { scope: 'none' | 'metric' | 'all'; metricKey?: MetricKey; forcedStatus?: 'degraded' };

export type StorageHealthApiResponse = {
  reachable: boolean;
  latency_ms: number;
  error?: string;
  retrieval_latency_ms?: number | null;
  storage_capacity_percent?: number;
  storage_capacity_bytes?: number;
  total_bytes?: number;
  bucket_bytes?: Record<string, number>;
  orphaned_files?: number;
  orphaned_proofs?: number;
  orphaned_id_documents?: number;
  orphaned_avatars?: number;
  category_volume?: Record<ProofCategory, number>;
};

export type StorageHealthSnapshot = {
  timestamp: string;
  reachable: boolean;
  error?: string;
  metrics: Record<MetricKey, MetricReading>;
  overallStatus: HealthStatus;
  totalBytes: number;
  storageCapacityBytes: number;
  orphanedFiles: number;
  categoryVolume: Record<ProofCategory, number>;
};

const SEVERITY: Record<HealthStatus, number> = { operational: 0, degraded: 1, down: 2 };
export function worstOf(...statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), 'operational' as HealthStatus);
}

// Storage capacity used (%) — real total bytes across all 3 buckets vs. a
// configured capacity constant (Supabase Storage has no queryable
// "provisioned capacity"). Capped at 'degraded'.
function statusForCapacity(v: number): HealthStatus {
  return v > 75 ? 'degraded' : 'operational';
}

// File retrieval latency (s) — real, timing a signed-URL creation against
// the most recently uploaded object. Capped at 'degraded'.
function statusForLatency(v: number): HealthStatus {
  return v > 2 ? 'degraded' : 'operational';
}

function reading(key: MetricKey, label: string, value: number | null, unit: string, status: HealthStatus, previousValue: number | null, collecting = false): MetricReading {
  return { key, label, value, unit, status, previousValue, collecting };
}

const EMPTY_CATEGORY_VOLUME: Record<ProofCategory, number> = { idVerification: 0, contributionProof: 0, loanReference: 0, expenseReceipt: 0 };

export function mapSnapshot(api: StorageHealthApiResponse, prev: StorageHealthSnapshot | null): StorageHealthSnapshot {
  if (!api.reachable) {
    return {
      timestamp: new Date().toISOString(),
      reachable: false,
      error: api.error,
      metrics: prev?.metrics ?? emptyMetrics(),
      overallStatus: 'down',
      totalBytes: prev?.totalBytes ?? 0,
      storageCapacityBytes: prev?.storageCapacityBytes ?? 0,
      orphanedFiles: prev?.orphanedFiles ?? 0,
      categoryVolume: prev?.categoryVolume ?? EMPTY_CATEGORY_VOLUME,
    };
  }

  const capacityValue = api.storage_capacity_percent ?? 0;
  const latencySeconds = api.retrieval_latency_ms != null ? api.retrieval_latency_ms / 1000 : null;
  const collectingLatency = latencySeconds === null;

  const metrics: Record<MetricKey, MetricReading> = {
    storageCapacity: reading('storageCapacity', 'Storage Capacity Used', capacityValue, '%', statusForCapacity(capacityValue), prev?.metrics.storageCapacity.value ?? null),
    retrievalLatency: reading('retrievalLatency', 'File Retrieval Latency', latencySeconds, 's', collectingLatency ? 'operational' : statusForLatency(latencySeconds as number), prev?.metrics.retrievalLatency.value ?? null, collectingLatency),
  };

  return {
    timestamp: new Date().toISOString(),
    reachable: true,
    metrics,
    overallStatus: worstOf(metrics.storageCapacity.status, metrics.retrievalLatency.status),
    totalBytes: api.total_bytes ?? 0,
    storageCapacityBytes: api.storage_capacity_bytes ?? 0,
    orphanedFiles: api.orphaned_files ?? 0,
    categoryVolume: api.category_volume ?? EMPTY_CATEGORY_VOLUME,
  };
}

function emptyMetrics(): Record<MetricKey, MetricReading> {
  return {
    storageCapacity: reading('storageCapacity', 'Storage Capacity Used', null, '%', 'down', null),
    retrievalLatency: reading('retrievalLatency', 'File Retrieval Latency', null, 's', 'down', null),
  };
}

export function applyDemoOverride(snapshot: StorageHealthSnapshot, override: DemoOverride): StorageHealthSnapshot {
  if (override.scope === 'none' || !override.forcedStatus) return snapshot;
  const forced = override.forcedStatus;
  const shouldForce = (key: MetricKey) => override.scope === 'all' || override.metricKey === key;

  const metrics = { ...snapshot.metrics };
  (Object.keys(metrics) as MetricKey[]).forEach((key) => {
    if (!shouldForce(key)) return;
    metrics[key] = { ...metrics[key], status: forced, collecting: false };
  });

  return { ...snapshot, metrics, overallStatus: worstOf(metrics.storageCapacity.status, metrics.retrievalLatency.status) };
}

export function diffIncidents(prev: StorageHealthSnapshot, next: StorageHealthSnapshot, demoActive: boolean): IncidentEntry[] {
  const incidents: IncidentEntry[] = [];

  if (prev.reachable !== next.reachable) {
    incidents.push({
      id: `reachability-${Date.now()}`,
      timestamp: next.timestamp,
      metricKey: 'reachability',
      metricLabel: 'Storage Reachability',
      fromStatus: prev.reachable ? 'operational' : 'down',
      toStatus: next.reachable ? 'operational' : 'down',
      detail: next.reachable ? 'Storage is reachable again' : `Storage became unreachable${next.error ? `: ${next.error}` : ''}`,
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
        detail: m.value !== null ? `${m.label} went from ${from} to ${to} (${m.value.toFixed(2)}${m.unit})` : `${m.label} went from ${from} to ${to}`,
        triggeredByDemoOverride: demoActive,
      });
    }
  });

  return incidents;
}
