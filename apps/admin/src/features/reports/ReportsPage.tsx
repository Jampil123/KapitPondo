/**
 * apps/admin/src/features/reports/ReportsPage.tsx — the Reports section's two
 * divisions:
 *   Reports & Analytics          — generated, read-only system-wide reports
 *   Reports of Problems / Complaints — the member-filed queue and its
 *                                      Review → Investigate → Resolve → Close workflow
 */
import { useState } from 'react';
import { BarChart3, MessageSquareWarning } from 'lucide-react';
import { AnalyticsReports } from './AnalyticsReports';
import { ProblemReports } from './ProblemReports';

const TABS = [
  { key: 'analytics', label: 'Reports & Analytics', icon: BarChart3 },
  { key: 'problems', label: 'Reports of Problems / Complaints', icon: MessageSquareWarning },
] as const;

export function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('analytics');

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      <div className="inline-flex items-center gap-1 bg-surface-alt rounded-xl p-1 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'
            }`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'analytics' ? <AnalyticsReports /> : <ProblemReports />}
    </div>
  );
}
