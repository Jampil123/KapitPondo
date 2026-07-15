/**
 * apps/admin/src/features/verifications/VerificationsPage.tsx
 * The core Sysadmin workflow: queue (Pending/Verified/Rejected) + a detail
 * drawer showing the submitted ID (via signed URL) with approve / reject.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Mail, Eye, Check, X, ShieldCheck, Users } from 'lucide-react';
import type { AccountStatus } from '@kapitpondo/shared';
import { AccountBadge } from '../../components/StatusBadge';
import { api } from '../../lib/api';

type Applicant = {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  verification_status: AccountStatus;
  id_type?: string;
  created_at?: string;
  city?: string;
  province?: string;
  reject_reason?: string;
  id_document_url?: string;
  id_document_signed_url?: string;
};
type Detail = { member: Applicant };

const TABS: { key: AccountStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

function initials(n?: string) { return (n ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function kv(label: string, value?: string) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase text-muted">{label}</div>
      <div className="text-[13px] text-ink mt-0.5">{value || '—'}</div>
    </div>
  );
}

type View = 'verification' | 'all';

export function VerificationsPage() {
  const [view, setView] = useState<View>('verification');
  const [tab, setTab] = useState<AccountStatus>('pending');
  const [rows, setRows] = useState<Applicant[]>([]);
  const [counts, setCounts] = useState<Record<AccountStatus, number | null>>({ unverified: null, pending: null, verified: null, rejected: null });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const status = view === 'all' ? 'all' : tab;
      const { members } = await api.get<{ members: Applicant[] }>(`/admin/verifications?status=${status}`);
      setRows(members);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }

  async function refreshCounts() {
    const results = await Promise.allSettled(
      TABS.map((t) => api.get<{ members: Applicant[] }>(`/admin/verifications?status=${t.key}`)),
    );
    setCounts((prev) => {
      const next = { ...prev };
      TABS.forEach((t, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') next[t.key] = r.value.members.length;
      });
      return next;
    });
  }

  // Standard data-fetch-on-[tab/view]-change effect; the setState calls inside
  // `load` are async (after the awaited request resolves), not synchronous in
  // the effect body.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tab, view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshCounts(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => (r.full_name ?? '').toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-6xl px-8 pt-6 pb-8">
      <div className="inline-flex items-center gap-1 bg-surface-alt rounded-xl p-1 mb-4">
        <button onClick={() => setView('verification')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'verification' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          Account Verification
          {counts.pending !== null && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-warning-bg text-warning text-[11px] font-semibold flex items-center justify-center">{counts.pending}</span>
          )}
        </button>
        <button onClick={() => setView('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'all' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          <Users size={15} /> All Users
        </button>
      </div>

      <div className="flex items-center justify-between mb-5">
        {view === 'verification' ? (
          <div className="flex gap-2">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border ${tab === t.key ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted'}`}>
                {t.label}{counts[t.key] !== null ? ` (${counts[t.key]})` : ''}
              </button>
            ))}
          </div>
        ) : <div />}
        <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-3.5 py-2.5 w-72">
          <Search size={17} className="text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applicants…" className="flex-1 bg-transparent text-sm text-ink outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-surface border border-line p-12 text-center">
          <ShieldCheck size={28} className="mx-auto text-muted mb-2" />
          <div className="font-semibold text-ink">Nothing here</div>
          <div className="text-sm text-muted">{view === 'all' ? 'No users yet.' : `No ${tab} accounts.`}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((u) => (
            <div key={u.id} className="rounded-2xl bg-surface border border-line overflow-hidden">
              <button onClick={() => setOpenId(u.id)} className="w-full text-left p-5 pb-0">
                <div className="flex items-center gap-3.5 mb-3.5">
                  <div className="rounded-full bg-surface-alt text-brand-dark flex items-center justify-center font-semibold" style={{ width: 52, height: 52 }}>{initials(u.full_name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink truncate">{u.full_name ?? 'Applicant'}</span>
                      <AccountBadge status={u.verification_status} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5"><Mail size={13} /> {u.email ?? '—'}</div>
                  </div>
                  <Eye size={18} className="text-muted" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-3.5 border-t border-line">
                  {kv('Phone', u.phone)}
                  {kv('Registered', u.created_at ? new Date(u.created_at).toLocaleDateString('en-PH') : undefined)}
                  {kv('ID type', u.id_type)}
                  {kv('Location', [u.city, u.province].filter(Boolean).join(', ') || undefined)}
                  {u.verification_status === 'rejected' && <div className="col-span-2">{kv('Reason', u.reject_reason)}</div>}
                </div>
              </button>
              {u.verification_status === 'pending' && (
                <div className="flex gap-2.5 px-5 py-3.5 border-t border-line">
                  <button onClick={() => setOpenId(u.id)} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-success-bg text-success text-sm font-semibold py-2.5">
                    <Check size={16} /> Review
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {openId && <VerificationDrawer id={openId} onClose={() => setOpenId(null)} onDone={() => { setOpenId(null); load(); refreshCounts(); }} />}
    </div>
  );
}

function VerificationDrawer({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Detail>(`/admin/verifications/${id}`).then(setDetail).catch((e) => setErr((e as Error).message));
  }, [id]);

  const a = detail?.member;
  const mode = a?.verification_status ?? 'pending';

  async function approve() {
    setBusy(true); setErr(null);
    try { await api.post(`/admin/verifications/${id}/approve`); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function reject() {
    if (!reason.trim()) return setErr('A rejection reason is required.');
    setBusy(true); setErr(null);
    try { await api.post(`/admin/verifications/${id}/reject`, { reason: reason.trim() }); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[480px] max-w-full h-full bg-surface shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <h2 className="text-base font-semibold text-ink">Account details</h2>
          <button onClick={onClose} className="text-muted"><X size={22} /></button>
        </div>

        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-muted text-sm">{err ?? 'Loading…'}</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center gap-2 mb-6">
                <div className="w-[76px] h-[76px] rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-xl font-semibold">{initials(a?.full_name)}</div>
                <div className="text-lg font-semibold text-ink mt-1">{a?.full_name ?? 'Applicant'}</div>
                <AccountBadge status={mode} />
              </div>

              <div className="grid grid-cols-2 gap-4 bg-surface-alt rounded-2xl mb-5" style={{ padding: 18 }}>
                {kv('Email', a?.email)}
                {kv('Phone', a?.phone)}
                {kv('Registered', a?.created_at ? new Date(a.created_at).toLocaleDateString('en-PH') : undefined)}
                {kv('ID type', a?.id_type)}
                <div className="col-span-2">{kv('Location', [a?.city, a?.province].filter(Boolean).join(', ') || undefined)}</div>
                {mode === 'rejected' && <div className="col-span-2">{kv('Reason', a?.reject_reason)}</div>}
              </div>

              <div className="text-[13px] font-semibold text-ink mb-2.5">Submitted document</div>
              <div className="bg-surface-alt rounded-2xl p-3.5">
                {a?.id_document_signed_url ? (
                  <img
                    src={a.id_document_signed_url}
                    alt="Submitted ID document"
                    className="w-full h-64 object-contain rounded-lg bg-surface"
                  />
                ) : (
                  <div className="h-40 rounded-lg flex flex-col items-center justify-center gap-2 text-muted"
                       style={{ background: 'repeating-linear-gradient(45deg,#E3EDF2,#E3EDF2 12px,#D9E6ED 12px,#D9E6ED 24px)' }}>
                    <span className="text-sm font-medium">
                      {a?.id_document_url ? 'Preview unavailable' : 'No document on file'}
                    </span>
                  </div>
                )}
              </div>

              {err && <div className="mt-4 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}
            </div>

            {mode === 'pending' && (
              rejecting ? (
                <div className="p-6 border-t border-line space-y-3">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for rejection…"
                            className="w-full rounded-xl bg-surface-alt p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand" />
                  <div className="flex gap-3">
                    <button onClick={() => setRejecting(false)} className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-secondary">Cancel</button>
                    <button onClick={reject} disabled={busy} className="flex-1 rounded-lg bg-danger py-2.5 text-sm font-semibold text-white disabled:opacity-60">Confirm reject</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 p-6 border-t border-line">
                  <button onClick={approve} disabled={busy} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-3 text-sm font-semibold text-white disabled:opacity-60">
                    <Check size={16} /> Verify account
                  </button>
                  <button onClick={() => setRejecting(true)} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-line py-3 text-sm font-semibold text-danger">
                    <X size={16} /> Reject
                  </button>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
