/**
 * apps/admin/src/features/reports/reportFormat.ts — display helpers shared by
 * the report table, the printed letterhead and ReportVisuals.
 */

// Display names where the raw value reads badly; anything else is prettified.
const STATUS_LABEL: Record<string, string> = {
  resubmission_required: 'Re-submission required',
  archived: 'Closed (archived)',
};

export function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/[._]/g, ' ');
}
