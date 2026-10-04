/**
 * apps/admin/src/features/complaints/ComplaintsPage.tsx — the member-filed
 * problems / complaints queue, on its own sidebar page.
 */
import { ProblemReports } from './ProblemReports';

export function ComplaintsPage() {
  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      <ProblemReports />
    </div>
  );
}
