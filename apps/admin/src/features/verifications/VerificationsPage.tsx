/**
 * apps/admin/src/features/verifications/VerificationsPage.tsx
 * The core Sysadmin workflow: queue (Pending/Verified/Requires Re-submission/Rejected) + a detail
 * drawer showing the submitted ID (via signed URL) with approve / reject.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Mail, Eye, Check, X, ShieldCheck, Users, Ban, RotateCcw, LayoutGrid, List } from 'lucide-react';
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
  birthday?: string;
  sex?: string;
  id_number?: string;
  city?: string;
  province?: string;
  verification_rejection_reason?: string;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  suspended_groups?: string[];       // only on the group-suspension list
  group_suspended_since?: string | null;
  id_document_url?: string;
  id_document_signed_url?: string;
  id_document_back_url?: string;
  id_document_back_signed_url?: string;
  id_document_qr_data?: string;
  selfie_url?: string;
  selfie_signed_url?: string;
};
type Detail = { member: Applicant };

const TABS: { key: AccountStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'resubmission_required', label: 'Requires Re-submission' },
  { key: 'rejected', label: 'Rejected' },
];

// Statuses that carry a reason for the member.
const HAS_REASON: AccountStatus[] = ['resubmission_required', 'rejected'];

// The two kinds of suspension this platform has. Platform suspension is the
// System Administrator's (migration 0057); group suspension belongs to the
// fund group's officers and is shown here read-only.
const SUSPENSION_TABS = [
  { key: 'suspended', label: 'Platform suspended' },
  { key: 'group_suspended', label: 'Suspended in a group' },
] as const;
type SuspensionTab = (typeof SUSPENSION_TABS)[number]['key'];

function SuspendedBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold bg-danger-bg text-danger">{label}</span>;
}

const TH = 'px-5 py-3 font-medium whitespace-nowrap';
const TD = 'px-5 py-3.5 whitespace-nowrap';

function initials(n?: string) { return (n ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function kv(label: string, value?: string) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase text-muted">{label}</div>
      <div className="text-[13px] text-ink mt-0.5">{value || '—'}</div>
    </div>
  );
}

type View = 'verification' | 'suspended' | 'all';

// Tiles vs table — a per-admin preference, remembered in this browser.
type Layout = 'tiles' | 'table';
const LAYOUT_KEY = 'kp-admin-users-layout';
function readLayout(): Layout {
  try { return localStorage.getItem(LAYOUT_KEY) === 'table' ? 'table' : 'tiles'; } catch { return 'tiles'; }
}

export function VerificationsPage() {
  // ?view=all deep-links straight to All Users (e.g. the Dashboard's Total Users card).
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<View>(searchParams.get('view') === 'all' ? 'all' : 'verification');
  const [tab, setTab] = useState<AccountStatus>('pending');
  const [suspensionTab, setSuspensionTab] = useState<SuspensionTab>('suspended');
  const [rows, setRows] = useState<Applicant[]>([]);
  const [counts, setCounts] = useState<Record<AccountStatus, number | null>>({ unverified: null, pending: null, verified: null, resubmission_required: null, rejected: null });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  function setLayout(l: Layout) {
    setLayoutState(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* storage blocked — still switches for this visit */ }
  }

  async function load() {
    setLoading(true);
    try {
      const status = view === 'all' ? 'all' : view === 'suspended' ? suspensionTab : tab;
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
  useEffect(() => { load(); }, [tab, view, suspensionTab]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshCounts(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => (r.full_name ?? '').toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      <div className="inline-flex items-center gap-1 bg-surface-alt rounded-xl p-1 mb-4">
        <button onClick={() => setView('verification')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'verification' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          Account Verification
          {counts.pending !== null && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-warning-bg text-warning text-[11px] font-semibold flex items-center justify-center">{counts.pending}</span>
          )}
        </button>
        <button onClick={() => setView('suspended')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'suspended' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          <Ban size={15} /> Suspended
        </button>
        <button onClick={() => setView('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'all' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          <Users size={15} /> All Users
        </button>
      </div>

      {view === 'suspended' && suspensionTab === 'group_suspended' && (
        <div className="flex items-start gap-2.5 mb-4 rounded-xl bg-surface-alt px-4 py-3 text-[13px] text-secondary">
          <Eye size={16} className="shrink-0 mt-0.5 text-brand-dark" />
          <span>
            <span className="font-semibold text-ink">Read-only.</span>{' '}
            These members were suspended inside a fund group by its officers. Lifting a group suspension is the officers' call, not the System Administrator's.
          </span>
        </div>
      )}

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
        ) : view === 'suspended' ? (
          <div className="flex gap-2">
            {SUSPENSION_TABS.map((t) => (
              <button key={t.key} onClick={() => setSuspensionTab(t.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border ${suspensionTab === t.key ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted'}`}>
                {t.label}
              </button>
            ))}
          </div>
        ) : <div />}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-3.5 py-2.5 w-72">
            <Search size={17} className="text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applicants…" className="flex-1 bg-transparent text-sm text-ink outline-none" />
          </div>
          <div className="inline-flex items-center gap-1 bg-surface-alt rounded-xl p-1">
            {([['tiles', LayoutGrid, 'Tiles'], ['table', List, 'Table']] as const).map(([key, Icon, label]) => (
              <button key={key} onClick={() => setLayout(key)} title={label} aria-label={`${label} view`} aria-pressed={layout === key}
                className={`p-2 rounded-lg transition-colors ${layout === key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
                <Icon size={17} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-surface border border-line p-12 text-center">
          <ShieldCheck size={28} className="mx-auto text-muted mb-2" />
          <div className="font-semibold text-ink">Nothing here</div>
          <div className="text-sm text-muted">
            {view === 'all' ? 'No users yet.'
              : view === 'suspended' ? (suspensionTab === 'suspended' ? 'No suspended accounts.' : 'Nobody is suspended in a fund group.')
              : `No ${tab} accounts.`}
          </div>
        </div>
      ) : layout === 'table' ? (
        <div className="rounded-2xl bg-surface border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className={TH}>Name</th>
                <th className={TH}>Status</th>
                <th className={TH}>Phone</th>
                <th className={TH}>ID type</th>
                <th className={TH}>Location</th>
                <th className={TH}>Registered</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} onClick={() => setOpenId(u.id)} className="border-b border-line last:border-0 cursor-pointer hover:bg-surface-alt">
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-xs font-semibold">{initials(u.full_name)}</div>
                      <div className="min-w-0">
                        <div className="font-semibold text-ink truncate">{u.full_name ?? 'Applicant'}</div>
                        <div className="text-xs text-muted truncate">{u.email ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <AccountBadge status={u.verification_status} />
                      {u.suspended_at ? <SuspendedBadge label="Suspended" /> : null}
                      {u.suspended_groups?.length ? <SuspendedBadge label="In group" /> : null}
                    </div>
                  </td>
                  <td className={`${TD} text-ink`}>{u.phone || '—'}</td>
                  <td className={`${TD} text-ink`}>{u.id_type || '—'}</td>
                  <td className={`${TD} text-ink`}>{[u.city, u.province].filter(Boolean).join(', ') || '—'}</td>
                  <td className={`${TD} text-secondary`}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-PH') : '—'}</td>
                  <td className={`${TD} text-right`}>
                    {u.verification_status === 'pending' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-success-bg text-success text-xs font-semibold px-3 py-1.5"><Check size={14} /> Review</span>
                    ) : (
                      <Eye size={17} className="inline text-muted" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                      {u.suspended_at ? <SuspendedBadge label="Suspended" /> : null}
                      {u.suspended_groups?.length ? <SuspendedBadge label="Suspended in group" /> : null}
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
                  {HAS_REASON.includes(u.verification_status) && <div className="col-span-2">{kv('Reason', u.verification_rejection_reason)}</div>}
                  {u.suspended_at && (
                    <>
                      {kv('Suspended on', new Date(u.suspended_at).toLocaleDateString('en-PH'))}
                      <div className="col-span-2">{kv('Suspension reason', u.suspension_reason ?? undefined)}</div>
                    </>
                  )}
                  {u.suspended_groups?.length ? (
                    <>
                      <div className="col-span-2">{kv('Suspended in', u.suspended_groups.join(', '))}</div>
                      {kv('Since', u.group_suspended_since ? new Date(u.group_suspended_since).toLocaleDateString('en-PH') : undefined)}
                    </>
                  ) : null}
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
  // Which "not verified" outcome the admin is writing a reason for.
  const [decision, setDecision] = useState<'resubmit' | 'reject' | null>(null);
  const [suspending, setSuspending] = useState(false);
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
  async function decide() {
    if (!reason.trim()) return setErr('A reason is required.');
    setBusy(true); setErr(null);
    const path = decision === 'resubmit' ? 'request-resubmission' : 'reject';
    try { await api.post(`/admin/verifications/${id}/${path}`, { reason: reason.trim() }); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  // Platform suspension — withdraws access until reinstated. It does not touch
  // the account's verification status, and never touches group finances.
  async function suspend() {
    if (!reason.trim()) return setErr('A suspension reason is required.');
    setBusy(true); setErr(null);
    try { await api.post(`/admin/accounts/${id}/suspend`, { reason: reason.trim() }); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function reinstate() {
    setBusy(true); setErr(null);
    try { await api.post(`/admin/accounts/${id}/reinstate`); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[88vh] bg-surface shadow-2xl rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <h2 className="text-base font-semibold text-ink">Account details</h2>
          <button onClick={onClose} className="text-muted"><X size={22} /></button>
        </div>

        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-muted text-sm py-16">{err ?? 'Loading…'}</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-[64px] h-[64px] shrink-0 rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-lg font-semibold">{initials(a?.full_name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-semibold text-ink truncate">{a?.full_name ?? 'Applicant'}</div>
                  <div className="flex items-center gap-2">
                    <AccountBadge status={mode} />
                    {a?.suspended_at ? <SuspendedBadge label="Suspended" /> : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 bg-surface-alt rounded-2xl mb-5" style={{ padding: 18 }}>
                {kv('Email', a?.email)}
                {kv('Phone', a?.phone)}
                {kv('Registered', a?.created_at ? new Date(a.created_at).toLocaleDateString('en-PH') : undefined)}
                {kv('ID type', a?.id_type)}
                {kv('Birthday', a?.birthday)}
                {kv('Sex', a?.sex ? a.sex.charAt(0).toUpperCase() + a.sex.slice(1) : undefined)}
                {kv('ID number', a?.id_number)}
                <div className="col-span-2">{kv('Location', [a?.city, a?.province].filter(Boolean).join(', ') || undefined)}</div>
                {HAS_REASON.includes(mode) && <div className="col-span-3">{kv('Reason', a?.verification_rejection_reason)}</div>}
                {a?.suspended_at && (
                  <>
                    {kv('Suspended on', new Date(a.suspended_at).toLocaleDateString('en-PH'))}
                    <div className="col-span-2">{kv('Suspension reason', a.suspension_reason ?? undefined)}</div>
                  </>
                )}
              </div>

              <div className="text-[13px] font-semibold text-ink mb-2.5">Submitted photos</div>
              <div className="grid grid-cols-3 gap-3.5 mb-5">
                <div>
                  <div className="text-[11px] text-muted mb-1.5">ID Front</div>
                  <div className="bg-surface-alt rounded-2xl p-2.5">
                    {a?.id_document_signed_url ? (
                      <img
                        src={a.id_document_signed_url}
                        alt="Submitted ID document (front)"
                        className="w-full h-40 object-contain rounded-lg bg-surface"
                      />
                    ) : (
                      <div className="h-40 rounded-lg flex flex-col items-center justify-center gap-2 text-muted"
                           style={{ background: 'repeating-linear-gradient(45deg,#E3EDF2,#E3EDF2 12px,#D9E6ED 12px,#D9E6ED 24px)' }}>
                        <span className="text-xs font-medium text-center px-2">
                          {a?.id_document_url ? 'Preview unavailable' : 'No document on file'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted mb-1.5">ID Back</div>
                  <div className="bg-surface-alt rounded-2xl p-2.5">
                    {a?.id_document_back_signed_url ? (
                      <img
                        src={a.id_document_back_signed_url}
                        alt="Submitted ID document (back)"
                        className="w-full h-40 object-contain rounded-lg bg-surface"
                      />
                    ) : (
                      <div className="h-40 rounded-lg flex flex-col items-center justify-center gap-2 text-muted"
                           style={{ background: 'repeating-linear-gradient(45deg,#E3EDF2,#E3EDF2 12px,#D9E6ED 12px,#D9E6ED 24px)' }}>
                        <span className="text-xs font-medium text-center px-2">
                          {a?.id_document_back_url ? 'Preview unavailable' : 'No back photo on file'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted mb-1.5">Selfie</div>
                  <div className="bg-surface-alt rounded-2xl p-2.5">
                    {a?.selfie_signed_url ? (
                      <img
                        src={a.selfie_signed_url}
                        alt="Submitted selfie"
                        className="w-full h-40 object-contain rounded-lg bg-surface"
                      />
                    ) : (
                      <div className="h-40 rounded-lg flex flex-col items-center justify-center gap-2 text-muted"
                           style={{ background: 'repeating-linear-gradient(45deg,#E3EDF2,#E3EDF2 12px,#D9E6ED 12px,#D9E6ED 24px)' }}>
                        <span className="text-xs font-medium text-center px-2">
                          {a?.selfie_url ? 'Preview unavailable' : 'No selfie on file'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-[13px] font-semibold text-ink mb-2.5">Back QR code</div>
              <div className="bg-surface-alt rounded-2xl p-3.5 mb-5">
                {a?.id_document_qr_data ? (
                  <>
                    <div className="text-[11px] font-mono text-ink break-all">{a.id_document_qr_data}</div>
                    <div className="text-[11px] text-muted mt-2">
                      Decoded on-device from the ID's QR code. This is the raw payload only — not a cryptographic
                      signature check against PSA, so verify authenticity by inspection, not by this text alone.
                    </div>
                  </>
                ) : (
                  <div className="text-[13px] text-muted">
                    No QR code was detected on the submitted back photo. A genuine PhilSys National ID has one —
                    treat this as a prompt for closer manual review, not proof the ID is fake.
                  </div>
                )}
              </div>

              {err && <div className="mt-4 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}
            </div>

            {/* Suspension is independent of the verification queue, so it sits
                in its own footer available on any account. */}
            {a?.suspended_at ? (
              <div className="flex items-center gap-3 p-6 border-t border-line">
                <div className="flex-1 text-[12.5px] text-muted">
                  This account cannot sign in while suspended.
                </div>
                <button onClick={reinstate} disabled={busy}
                        className="flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  <RotateCcw size={16} /> Reinstate account
                </button>
              </div>
            ) : suspending ? (
              <div className="p-6 border-t border-line space-y-3">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for suspension…"
                          className="w-full rounded-xl bg-surface-alt p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand" />
                <div className="text-[12px] text-muted">
                  Suspension withdraws platform access. It does not change this account's verification, and it does not
                  alter any fund group's financial records — those stay with the group's officers.
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setSuspending(false); setReason(''); }} className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-secondary">Cancel</button>
                  <button onClick={suspend} disabled={busy} className="flex-1 rounded-lg bg-danger py-2.5 text-sm font-semibold text-white disabled:opacity-60">Confirm suspend</button>
                </div>
              </div>
            ) : !decision && (
              <div className="flex justify-end px-6 py-3 border-t border-line">
                <button onClick={() => { setSuspending(true); setErr(null); }}
                        className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
                  <Ban size={15} /> Suspend account
                </button>
              </div>
            )}

            {mode === 'pending' && !a?.suspended_at && !suspending && (
              decision ? (
                <div className="p-6 border-t border-line space-y-3">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                            placeholder={decision === 'resubmit' ? 'What should the member fix? (e.g. photo is blurry)' : 'Reason for rejection…'}
                            className="w-full rounded-xl bg-surface-alt p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand" />
                  <div className="flex gap-3">
                    <button onClick={() => setDecision(null)} className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-secondary">Cancel</button>
                    <button onClick={decide} disabled={busy}
                            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${decision === 'resubmit' ? 'bg-brand' : 'bg-danger'}`}>
                      {decision === 'resubmit' ? 'Request re-submission' : 'Reject — final'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 p-6 border-t border-line">
                  <button onClick={approve} disabled={busy} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-3 text-sm font-semibold text-white disabled:opacity-60">
                    <Check size={16} /> Verify account
                  </button>
                  <button onClick={() => setDecision('resubmit')} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-line py-3 text-sm font-semibold text-brand-dark">
                    <RotateCcw size={16} /> Request re-submission
                  </button>
                  <button onClick={() => setDecision('reject')} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-line py-3 text-sm font-semibold text-danger">
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
