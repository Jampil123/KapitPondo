/**
 * apps/admin/src/features/system-health/authServicesHealthReal.ts
 * Types + status logic for the Auth Services Health page. Only the ID
 * Verification Queue column is backed by real data (GET
 * /admin/monitoring/verification-queue → verification_queue_health() RPC,
 * migration 0032). OTP/SMS and Login/Session have no underlying system to
 * read from in this codebase yet — no SMS/OTP integration exists, and login
 * goes straight from the client to Supabase Auth, bypassing this backend —
 * so those are shown as an honest "not available" state. See
 * UNAVAILABLE_METRICS.
 */

export type HealthStatus = 'operational' | 'degraded' | 'down';
export type MetricKey = 'queueDepth' | 'oldestPendingAge';

export type MetricReading = {
  key: MetricKey;
  label: string;
  value: number | null;
  unit: string;
  status: HealthStatus;
  previousValue: number | null;
};

export type UnavailableMetric = { key: string; label: string; subPanel: 'otp' | 'login'; reason: string };

export const UNAVAILABLE_METRICS: UnavailableMetric[] = [
  { key: 'otpSuccessRate', label: 'OTP Delivery Success Rate', subPanel: 'otp', reason: 'No SMS/OTP provider is integrated in this codebase (services/api/src/integrations/sms is empty) — there’s no delivery to measure.' },
  { key: 'otpLatency', label: 'OTP Delivery Latency', subPanel: 'otp', reason: 'Same as above — no OTP dispatch or delivery-confirmation events exist to time.' },
  { key: 'otpGateway', label: 'OTP Gateway Provider', subPanel: 'otp', reason: 'No SMS gateway is configured, so there’s no provider to health-check.' },
  { key: 'otpCleanupJob', label: 'OTP Expiry/Cleanup Job', subPanel: 'otp', reason: 'No OTP table or background job exists yet (services/api/src/jobs is empty).' },
  { key: 'loginFailureRate', label: 'Login Failure Rate', subPanel: 'login', reason: 'Login goes directly from the app to Supabase Auth’s client SDK — this backend never sees the attempt.' },
  { key: 'sessionErrorRate', label: 'Session/Token Error Rate', subPanel: 'login', reason: 'Session issuance happens inside Supabase Auth; this backend has no hook into token-issuance errors.' },
];

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

// Verification Queue is a human backlog, not an outage — only 'degraded' can ever be forced.
export type DemoOverride = { scope: 'none' | 'metric' | 'all'; metricKey?: MetricKey; forcedStatus?: 'degraded' };

export type VerificationQueueApiResponse = {
  pending_count: number;
  oldest_pending_hours: number | null;
  avg_turnaround_hours_7d: number | null;
  turnaround_sample_size_7d: number;
};

export type AuthServicesSnapshot = {
  timestamp: string;
  metrics: Record<MetricKey, MetricReading>;
  avgTurnaroundHours: number | null;
  turnaroundSampleSize: number;
  status: HealthStatus; // caps at 'degraded' — never 'down'
};

const SEVERITY: Record<HealthStatus, number> = { operational: 0, degraded: 1, down: 2 };
export function worstOf(...statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), 'operational' as HealthStatus);
}

// Pending verification queue depth — real, from members.verification_status = 'pending'.
function statusForQueueDepth(v: number): HealthStatus {
  return v > 20 ? 'degraded' : 'operational';
}

// Oldest pending item age (hours) — real, from members.submitted_at (backfilled
// from updated_at for pre-existing pending rows; see migration 0032).
function statusForOldestAge(v: number): HealthStatus {
  return v > 24 ? 'degraded' : 'operational';
}

function reading(key: MetricKey, label: string, value: number | null, unit: string, status: HealthStatus, previousValue: number | null): MetricReading {
  return { key, label, value, unit, status, previousValue };
}

export function mapSnapshot(api: VerificationQueueApiResponse, prev: AuthServicesSnapshot | null): AuthServicesSnapshot {
  const oldestValue = api.oldest_pending_hours;

  const metrics: Record<MetricKey, MetricReading> = {
    queueDepth: reading('queueDepth', 'Verification Queue Depth', api.pending_count, '', statusForQueueDepth(api.pending_count), prev?.metrics.queueDepth.value ?? null),
    oldestPendingAge: reading('oldestPendingAge', 'Oldest Pending Item Age', oldestValue, 'h', oldestValue === null ? 'operational' : statusForOldestAge(oldestValue), prev?.metrics.oldestPendingAge.value ?? null),
  };

  return {
    timestamp: new Date().toISOString(),
    metrics,
    avgTurnaroundHours: api.avg_turnaround_hours_7d,
    turnaroundSampleSize: api.turnaround_sample_size_7d,
    status: worstOf(metrics.queueDepth.status, metrics.oldestPendingAge.status),
  };
}

export function applyDemoOverride(snapshot: AuthServicesSnapshot, override: DemoOverride): AuthServicesSnapshot {
  if (override.scope === 'none' || !override.forcedStatus) return snapshot;
  const forced = override.forcedStatus;
  const shouldForce = (key: MetricKey) => override.scope === 'all' || override.metricKey === key;

  const metrics = { ...snapshot.metrics };
  (Object.keys(metrics) as MetricKey[]).forEach((key) => {
    if (!shouldForce(key)) return;
    metrics[key] = { ...metrics[key], status: forced };
  });

  return { ...snapshot, metrics, status: worstOf(metrics.queueDepth.status, metrics.oldestPendingAge.status) };
}

export function diffIncidents(prev: AuthServicesSnapshot, next: AuthServicesSnapshot, demoActive: boolean): IncidentEntry[] {
  const incidents: IncidentEntry[] = [];
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
