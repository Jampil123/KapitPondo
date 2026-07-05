/** apps/admin/src/lib/format.ts — small shared formatters for the admin console. */
export function formatPeso(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '₱0.00';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '₱0.00';
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
