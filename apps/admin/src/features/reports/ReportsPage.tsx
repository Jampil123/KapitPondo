/**
 * apps/admin/src/features/reports/ReportsPage.tsx — Reports & Analytics:
 * generated, read-only system-wide reports. (Member complaints have their own
 * page — see features/complaints.)
 */
import { AnalyticsReports } from './AnalyticsReports';

export function ReportsPage() {
  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8 print:p-0">
      <AnalyticsReports />
    </div>
  );
}
