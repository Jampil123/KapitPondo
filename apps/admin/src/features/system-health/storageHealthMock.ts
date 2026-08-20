/**
 * apps/admin/src/features/system-health/storageHealthMock.ts
 * Local mock data engine for the "Storage Health" capstone-demo panel
 * (StorageHealthPage.tsx). Purely simulated — no cloud storage provider
 * connection. Proof files back every financial claim in KapitPondo (§0.2:
 * ID docs, contribution proofs, loan disbursement refs, expense receipts),
 * so this panel exists even though it's a prototype for now.
 */

export type HealthStatus = 'operational' | 'degraded' | 'down';
export type MetricKey = 'uploadFailureRate' | 'storageCapacity' | 'retrievalLatency' | 'scanFailures';
export type ProofCategory = 'idVerification' | 'contributionProof' | 'loanReference' | 'expenseReceipt';

export type MetricReading = {
  key: MetricKey;
  label: string;
  value: number;
  unit: string;
  status: HealthStatus;
  previousValue: number;
};

export type CategoryStat = {
  category: ProofCategory;
  label: string;
  volume: number;
  failureRate: number;
  elevated: boolean;
};

export type IncidentEntry = {
  id: string;
  timestamp: string;
  metricKey: MetricKey;
  metricLabel: string;
  fromStatus: HealthStatus;
  toStatus: HealthStatus;
  detail: string;
  triggeredByDemoOverride: boolean;
};

export type DemoOverride = { scope: 'none' | 'metric' | 'all'; metricKey?: MetricKey; forcedStatus?: 'degraded' | 'down' };

export type StorageHealthSnapshot = {
  timestamp: string;
  metrics: Record<MetricKey, MetricReading>;
  categories: Record<ProofCategory, CategoryStat>;
  orphanedFiles: number;
  overallStatus: HealthStatus;
};

const METRIC_LABELS: Record<MetricKey, string> = {
  uploadFailureRate: 'Upload Failure Rate',
  storageCapacity: 'Storage Capacity Used',
  retrievalLatency: 'File Retrieval Latency',
  scanFailures: 'Scan Failures (24h)',
};
const METRIC_UNITS: Record<MetricKey, string> = {
  uploadFailureRate: '%',
  storageCapacity: '%',
  retrievalLatency: 's',
  scanFailures: '',
};

const CATEGORY_LABELS: Record<ProofCategory, string> = {
  idVerification: 'ID Verification',
  contributionProof: 'Contribution Proof',
  loanReference: 'Loan Reference',
  expenseReceipt: 'Expense Receipt',
};
export const CATEGORY_ORDER: ProofCategory[] = ['idVerification', 'contributionProof', 'loanReference', 'expenseReceipt'];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function randomDelta(spread: number) {
  return (Math.random() - 0.5) * 2 * spread;
}

const SEVERITY: Record<HealthStatus, number> = { operational: 0, degraded: 1, down: 2 };
export function worstOf(...statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), 'operational' as HealthStatus);
}

// Upload failure rate (%) — production source: storage provider's upload
// API/webhook response codes (4xx/5xx ratio over successful PUTs).
function statusForUploadFailureRate(v: number): HealthStatus {
  if (v > 10) return 'down';
  if (v > 2) return 'degraded';
  return 'operational';
}

// Storage capacity used (%) — production source: cloud storage provider's
// bucket usage API (e.g. Supabase Storage quota, S3 CloudWatch metrics).
// Capped at 'degraded' per the status model — a full bucket is a capacity
// problem to plan around, not an outage by itself.
function statusForCapacity(v: number): HealthStatus {
  return v > 75 ? 'degraded' : 'operational';
}

// File retrieval latency (avg seconds) — production source: CDN/storage
// gateway response-time metrics (or client-side timing around signed-URL
// fetches). Capped at 'degraded' — slow reads are a UX problem, not a
// system failure, per the status model.
function statusForLatency(v: number): HealthStatus {
  return v > 2 ? 'degraded' : 'operational';
}

// Scan failures in the last 24h — production source: the malware/format
// validation step in the upload pipeline (e.g. ClamAV sidecar, or the
// storage provider's built-in content-validation hook) logging a
// blocked-upload event. Spikes are a security signal, so this can reach 'down'.
function statusForScanFailures(v: number): HealthStatus {
  if (v > 3) return 'down';
  if (v >= 1) return 'degraded';
  return 'operational';
}

function reading(key: MetricKey, value: number, previousValue: number): MetricReading {
  return { key, label: METRIC_LABELS[key], value, unit: METRIC_UNITS[key], status: statusForMetric(key, value), previousValue };
}

function statusForMetric(key: MetricKey, value: number): HealthStatus {
  switch (key) {
    case 'uploadFailureRate': return statusForUploadFailureRate(value);
    case 'storageCapacity': return statusForCapacity(value);
    case 'retrievalLatency': return statusForLatency(value);
    case 'scanFailures': return statusForScanFailures(value);
  }
}

export function overallStatus(metrics: Record<MetricKey, MetricReading>): HealthStatus {
  return worstOf(metrics.uploadFailureRate.status, metrics.storageCapacity.status, metrics.retrievalLatency.status, metrics.scanFailures.status);
}

const momentum: Record<MetricKey, number> = { uploadFailureRate: 0, storageCapacity: 0, retrievalLatency: 0, scanFailures: 0 };
function maybeSpike(key: MetricKey, probability: number, magnitude: number) {
  if (Math.random() < probability) momentum[key] += magnitude;
  const applied = momentum[key];
  momentum[key] *= 0.5;
  return applied;
}

// Upload success/failure rate — production source: storage provider's
// upload API/webhook response codes.
function nextUploadFailureRate(prev: number): number {
  const spike = maybeSpike('uploadFailureRate', 0.035, 12);
  return clamp(prev + randomDelta(0.3) + spike, 0.2, 45);
}

// Storage capacity used — production source: cloud storage provider's
// bucket usage API. Drifts upward slowly (files accumulate over time)
// rather than oscillating, per the "climbing toward 75%" requirement.
function nextCapacity(prev: number): number {
  return clamp(prev + 0.12 + Math.random() * 0.1, 20, 99);
}

// File retrieval latency — production source: CDN/storage gateway
// response-time metrics.
function nextLatency(prev: number): number {
  const spike = maybeSpike('retrievalLatency', 0.03, 3.5);
  return clamp(prev + randomDelta(0.08) + spike, 0.15, 8);
}

// Scan failures (24h count) — production source: upload-pipeline malware/
// format validation step (e.g. ClamAV) logging a blocked upload.
function nextScanFailures(prev: number): number {
  // Mostly stays at/near baseline; rare bursts represent a batch of bad
  // uploads (e.g. a corrupted-file wave), then decays back down.
  if (Math.random() < 0.03) return Math.round(clamp(prev + 2 + Math.random() * 3, 0, 12));
  if (prev > 0 && Math.random() < 0.25) return Math.max(0, prev - 1); // 24h window rolling off
  return prev;
}

function nextCategory(prev: CategoryStat, overallFailureRate: number, spikeBias: number): CategoryStat {
  const spike = Math.random() < 0.02 * spikeBias ? 8 + Math.random() * 10 : 0;
  const failureRate = clamp(prev.failureRate + randomDelta(0.4) - (prev.failureRate > 3 ? 0.6 : 0) + spike, 0.1, 40);
  const volume = prev.volume + Math.round(Math.random() * 3);
  return {
    ...prev,
    volume,
    failureRate,
    elevated: failureRate > Math.max(5, overallFailureRate * 2),
  };
}

export function seedSnapshot(): StorageHealthSnapshot {
  const uploadFailureRate = 0.8;
  const storageCapacity = 52;
  const retrievalLatency = 0.6;
  const scanFailures = 0;

  const metrics: Record<MetricKey, MetricReading> = {
    uploadFailureRate: reading('uploadFailureRate', uploadFailureRate, uploadFailureRate),
    storageCapacity: reading('storageCapacity', storageCapacity, storageCapacity),
    retrievalLatency: reading('retrievalLatency', retrievalLatency, retrievalLatency),
    scanFailures: reading('scanFailures', scanFailures, scanFailures),
  };

  const categories: Record<ProofCategory, CategoryStat> = {
    idVerification: { category: 'idVerification', label: CATEGORY_LABELS.idVerification, volume: 340, failureRate: 0.9, elevated: false },
    contributionProof: { category: 'contributionProof', label: CATEGORY_LABELS.contributionProof, volume: 1180, failureRate: 0.6, elevated: false },
    loanReference: { category: 'loanReference', label: CATEGORY_LABELS.loanReference, volume: 210, failureRate: 0.7, elevated: false },
    expenseReceipt: { category: 'expenseReceipt', label: CATEGORY_LABELS.expenseReceipt, volume: 465, failureRate: 0.5, elevated: false },
  };

  return {
    timestamp: new Date().toISOString(),
    metrics,
    categories,
    orphanedFiles: 23,
    overallStatus: overallStatus(metrics),
  };
}

function applyOverride(key: MetricKey, computed: MetricReading, override: DemoOverride): MetricReading {
  const forced = override.scope === 'all' || (override.scope === 'metric' && override.metricKey === key);
  if (!forced || !override.forcedStatus) return computed;

  const pins: Record<MetricKey, { degraded: number; down: number }> = {
    uploadFailureRate: { degraded: 5, down: 25 },
    storageCapacity: { degraded: 85, down: 85 }, // capped — 'down' isn't offered for this metric in the UI
    retrievalLatency: { degraded: 3.5, down: 3.5 },
    scanFailures: { degraded: 2, down: 6 },
  };
  const base = pins[key][override.forcedStatus === 'down' ? 'down' : 'degraded'];
  const value = clamp(base + randomDelta(base * 0.05), 0, base * 1.3);

  return { ...computed, value, status: override.forcedStatus };
}

export function tick(prev: StorageHealthSnapshot, override: DemoOverride): { snapshot: StorageHealthSnapshot; incidents: IncidentEntry[] } {
  const uploadFailureRate = nextUploadFailureRate(prev.metrics.uploadFailureRate.value);
  const storageCapacity = nextCapacity(prev.metrics.storageCapacity.value);
  const retrievalLatency = nextLatency(prev.metrics.retrievalLatency.value);
  const scanFailures = nextScanFailures(prev.metrics.scanFailures.value);

  let metrics: Record<MetricKey, MetricReading> = {
    uploadFailureRate: reading('uploadFailureRate', uploadFailureRate, prev.metrics.uploadFailureRate.value),
    storageCapacity: reading('storageCapacity', storageCapacity, prev.metrics.storageCapacity.value),
    retrievalLatency: reading('retrievalLatency', retrievalLatency, prev.metrics.retrievalLatency.value),
    scanFailures: reading('scanFailures', scanFailures, prev.metrics.scanFailures.value),
  };

  if (override.scope !== 'none') {
    metrics = Object.fromEntries(
      (Object.keys(metrics) as MetricKey[]).map((k) => [k, applyOverride(k, metrics[k], override)])
    ) as Record<MetricKey, MetricReading>;
  }

  const categories = Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, nextCategory(prev.categories[c], metrics.uploadFailureRate.value, c === 'idVerification' ? 2.5 : 1)])
  ) as Record<ProofCategory, CategoryStat>;

  const incidents: IncidentEntry[] = [];
  (Object.keys(metrics) as MetricKey[]).forEach((key) => {
    const from = prev.metrics[key].status;
    const to = metrics[key].status;
    if (from !== to) {
      incidents.push({
        id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        metricKey: key,
        metricLabel: METRIC_LABELS[key],
        fromStatus: from,
        toStatus: to,
        detail: `${METRIC_LABELS[key]} went from ${from} to ${to} (${metrics[key].value.toFixed(1)}${METRIC_UNITS[key]})`,
        triggeredByDemoOverride: override.scope !== 'none',
      });
    }
  });

  const snapshot: StorageHealthSnapshot = {
    timestamp: new Date().toISOString(),
    metrics,
    categories,
    orphanedFiles: prev.orphanedFiles + (Math.random() < 0.15 ? 1 : 0),
    overallStatus: override.scope === 'all' && override.forcedStatus ? override.forcedStatus : overallStatus(metrics),
  };

  return { snapshot, incidents };
}

export function sweepOrphans(snapshot: StorageHealthSnapshot): { snapshot: StorageHealthSnapshot; swept: number } {
  const swept = Math.min(snapshot.orphanedFiles, Math.floor(snapshot.orphanedFiles * (0.5 + Math.random() * 0.4)));
  return { snapshot: { ...snapshot, orphanedFiles: snapshot.orphanedFiles - swept }, swept };
}
