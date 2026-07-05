/**
 * apps/admin/src/features/verifications/VerificationsPage.tsx
 * The identity-verification queue: list (GET /admin/verifications?status=),
 * inspect one member (GET /admin/verifications/:id), and approve/reject.
 */
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';

type Status = 'pending' | 'verified' | 'rejected';

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  id_document_url: string | null;
  verification_status: Status;
  created_at: string;
};

type MemberDetail = MemberRow & {
  id_type?: string | null;
  selfie_url?: string | null;
  nationality?: string | null;
  region?: string | null;
  province?: string | null;
  city?: string | null;
  barangay?: string | null;
  street_address?: string | null;
  zip_code?: string | null;
  source_of_funds?: string | null;
  employment_status?: string | null;
  occupation?: string | null;
};

const TABS: { key: Status; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm text-ink">{value || '—'}</div>
    </div>
  );
}

export function VerificationsPage() {
  const [status, setStatus] = useState<Status>('pending');
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ members: MemberRow[] }>(`/admin/verifications?status=${status}`);
      setRows(res.members ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load verification queue');
    } finally {
      setLoading(false);
    }
  }, [status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch, see comment above
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch, see comment above
    setDetailLoading(true);
    api.get<{ member: MemberDetail }>(`/admin/verifications/${selectedId}`)
      .then((res) => { if (mounted) setDetail(res.member); })
      .catch((e) => { if (mounted) setError(e instanceof ApiError ? e.message : 'Failed to load member'); })
      .finally(() => { if (mounted) setDetailLoading(false); });
    return () => { mounted = false; };
  }, [selectedId]);

  async function onApprove(id: string) {
    if (!window.confirm('Approve this member? This marks them verified.')) return;
    setBusy(true);
    try {
      await api.post(`/admin/verifications/${id}/approve`);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not approve');
    } finally {
      setBusy(false);
    }
  }

  async function onReject(id: string) {
    if (!window.confirm('Reject this member? They will be able to resubmit.')) return;
    setBusy(true);
    try {
      await api.post(`/admin/verifications/${id}/reject`);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reject');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink mb-4">Verifications</h1>

      <div className="flex gap-1 mb-4 rounded-lg bg-surface-alt p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setSelectedId(null); setDetail(null); }}
            className={`rounded-md px-3 py-1.5 text-sm ${status === t.key ? 'bg-surface text-ink font-medium shadow-sm' : 'text-secondary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="rounded-2xl bg-surface border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted">No {status} members.</td></tr>
              ) : rows.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`border-b border-line last:border-0 cursor-pointer hover:bg-surface-alt ${selectedId === m.id ? 'bg-surface-alt' : ''}`}
                >
                  <td className="px-4 py-3 text-ink">{m.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-secondary">{m.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-secondary">{formatDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl bg-surface border border-line p-5">
          {!selectedId ? (
            <div className="text-sm text-muted">Select a member to view their submitted details.</div>
          ) : detailLoading || !detail ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-bold text-ink">{detail.full_name}</div>
                <div className="text-xs text-muted">{detail.email || detail.phone}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ID Type" value={detail.id_type} />
                <Field label="Nationality" value={detail.nationality} />
                <Field label="Source of Funds" value={detail.source_of_funds} />
                <Field label="Employment" value={detail.employment_status} />
              </div>
              <Field
                label="Address"
                value={[detail.street_address, detail.barangay, detail.city, detail.province, detail.region].filter(Boolean).join(', ')}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="ID Document" value={detail.id_document_url ? 'Uploaded' : 'Not submitted'} />
                <Field label="Selfie" value={detail.selfie_url ? 'Uploaded' : 'Not submitted'} />
              </div>

              {status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <button
                    disabled={busy}
                    onClick={() => onApprove(detail.id)}
                    className="flex-1 rounded-lg bg-success-bg text-success text-sm font-medium py-2 disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onReject(detail.id)}
                    className="flex-1 rounded-lg bg-danger-bg text-danger text-sm font-medium py-2 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
