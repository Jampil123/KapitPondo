/**
 * api/system.ts — what the app reads from the System Administrator's
 * System Configuration (services/api modules/systemConfig, migration 0066).
 */
import { api } from './client';

export interface SystemConfig {
  verification: {
    accepted_id_types: { value: string; label: string }[];
    require_id_back: boolean;
    require_selfie: boolean;
    minimum_age: number;
  };
  complaint_categories: { key: string; label: string }[];
}

export interface SystemAnnouncement {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'warning' | 'critical';
  starts_at: string;
  ends_at: string | null;
}

export interface SystemPolicy {
  kind: 'terms' | 'privacy' | 'community';
  title: string;
  body: string;
  version: string;
  published_at: string;
}

export async function getSystemConfig() {
  return api.get<SystemConfig>('/api/system/config');
}

export async function getSystemAnnouncements() {
  const res = await api.get<{ announcements: SystemAnnouncement[] }>('/api/system/announcements');
  return res.announcements;
}

/** The live published version, or null when none has been published yet. */
export async function getSystemPolicy(kind: SystemPolicy['kind']): Promise<SystemPolicy | null> {
  try {
    return (await api.get<{ policy: SystemPolicy }>(`/api/system/policies/${kind}`)).policy;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}
