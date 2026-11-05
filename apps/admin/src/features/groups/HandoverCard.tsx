/**
 * apps/admin/src/features/groups/HandoverCard.tsx — UC-GM-10 A1.
 *
 * When a group's Organizer is suspended or inactive and the officers report
 * it, the System Administrator names an Active, Verified member who isn't an
 * officer. That member gets the same request the Organizer would send and
 * accepts it in the app. Role only: nothing here shows or changes money.
 */
import { useEffect, useState } from 'react';
import { Crown, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';

type Candidate = { member_id: string; full_name: string | null; role: string; eligible: boolean; blocked: string | null };
type Pending = { id: string; reason: string; expires_at: string; created_at: string; by_sysadmin: boolean; to: { full_name: string | null } | null };
type View = { organizer: { member_id: string; full_name: string | null } | null; members: Candidate[]; pending: Pending | null };
type Report = { id: string; subject: string; status: string };

const OPEN_REPORT = ['new', 'under_review', 'investigating'];

export function HandoverCard({ groupId, reports }: { groupId: string; reports: Report[] }) {
  const [view, setView] = useState<View | null>(null);
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [reportId, setReportId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setView(await api.get<View>(`/admin/fund-groups/${groupId}/handover`)); }
    catch (e) { setErr((e as Error).message); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [groupId]);

  async function send() {
    if (!memberId) return setErr('Choose the member who should become the Organizer.');
    if (!reason.trim()) return setErr('Give a reason for the hand-over.');
    setBusy(true); setErr(null);
    try {
      await api.post(`/admin/fund-groups/${groupId}/handover`, { member_id: memberId, reason: reason.trim(), problem_report_id: reportId || null });
      setOpen(false); setMemberId(''); setReason(''); setReportId('');
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function cancel() {
    if (!view?.pending) return;
    setBusy(true); setErr(null);
    try { await api.post(`/admin/fund-groups/${groupId}/handover/${view.pending.id}/cancel`); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (!view) return null;
  const eligible = view.members.filter((m) => m.eligible);
  const openReports = reports.filter((r) => OPEN_REPORT.includes(r.status));

  return (
    <section className="rounded-2xl bg-surface border border-line xl:col-span-2">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Crown size={16} className="text-brand-dark" /> Organizer hand-over</div>
        <span className="text-xs text-muted">Organizer: {view.organizer?.full_name ?? 'none'}</span>
      </div>
      <div className="p-5">

      {err && <div className="mb-3 rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}

      {view.pending ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl bg-surface-alt px-4 py-3">
            <Clock size={16} className="shrink-0 mt-0.5 text-brand-dark" />
            <div className="text-[13px] min-w-0">
              <div className="font-semibold text-ink">Waiting for {view.pending.to?.full_name ?? 'the member'} to accept</div>
              <div className="text-muted mt-0.5">
                Sent {formatDate(view.pending.created_at)}{view.pending.by_sysadmin ? ' by a System Administrator' : ' by the Organizer'} · expires {formatDate(view.pending.expires_at)}
              </div>
              <div className="text-ink mt-1">{view.pending.reason}</div>
            </div>
          </div>
          <button onClick={cancel} disabled={busy} className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-secondary disabled:opacity-60">
            {busy ? 'Cancelling…' : 'Cancel request'}
          </button>
        </div>
      ) : !open ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] text-muted">If the Organizer is suspended or inactive, name a member to take over.</div>
          <button onClick={() => { setOpen(true); setErr(null); }} className="shrink-0 rounded-lg bg-brand-dark px-3.5 py-2 text-[13px] font-semibold text-white">
            Assign new Organizer
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {eligible.length === 0 ? (
            <div className="text-sm text-muted">No Active, Verified member outside the officer roles is available.</div>
          ) : (
            <select value={memberId} onChange={(e) => { setMemberId(e.target.value); setErr(null); }}
              className="w-full rounded-xl bg-surface-alt p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-dark">
              <option value="">Choose a member…</option>
              {view.members.map((m) => (
                <option key={m.member_id} value={m.member_id} disabled={!m.eligible}>
                  {m.full_name ?? 'Member'}{m.eligible ? '' : ` — ${m.blocked}`}
                </option>
              ))}
            </select>
          )}
          {openReports.length > 0 && (
            <select value={reportId} onChange={(e) => setReportId(e.target.value)}
              className="w-full rounded-xl bg-surface-alt p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-dark">
              <option value="">Link a problem report (optional)</option>
              {openReports.map((r) => <option key={r.id} value={r.id}>{r.subject}</option>)}
            </select>
          )}
          <textarea value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} rows={2}
            placeholder="Reason (the member sees this)"
            className="w-full rounded-xl bg-surface-alt p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-dark" />
          <div className="text-[12px] text-muted">The member accepts in the app. This changes the role only — not the group's money.</div>
          <div className="flex gap-3 max-w-md">
            <button onClick={() => { setOpen(false); setErr(null); }} className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-secondary">Cancel</button>
            <button onClick={send} disabled={busy || eligible.length === 0} className="flex-1 rounded-lg bg-brand-dark py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
