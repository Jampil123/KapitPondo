/**
 * apps/admin/src/features/system-health/SystemHealthPage.tsx
 * Shared placeholder for the System Health sidebar section (Database, Auth
 * Service, Storage, Background Jobs) — detailed per-service monitoring isn't
 * built yet; the live status summary lives on the Dashboard's "System
 * health" card.
 */
import type { LucideIcon } from 'lucide-react';

export function SystemHealthPage({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mx-auto max-w-3xl px-8 pt-6 pb-8">
      <div className="rounded-2xl bg-surface border border-line p-10 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-surface-alt flex items-center justify-center">
          <Icon size={22} className="text-brand-dark" />
        </div>
        <div className="text-base font-semibold text-ink">{title}</div>
        <p className="text-sm text-muted max-w-sm">
          Detailed {title.toLowerCase()} monitoring is coming soon. Current status is available on the Dashboard.
        </p>
      </div>
    </div>
  );
}
