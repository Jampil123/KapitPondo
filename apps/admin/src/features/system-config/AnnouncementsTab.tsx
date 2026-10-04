/**
 * apps/admin/src/features/system-config/AnnouncementsTab.tsx — system
 * announcements: platform-wide notices the member app shows as a banner on
 * My Groups while they're live. Optionally pushed as a notification the
 * moment they're published.
 */
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Field, Toggle, inputClass } from './ui';

type Announcement = {
  id: string; title: string; body: string;
  audience: 'all' | 'officers'; tone: 'info' | 'warning' | 'critical';
  starts_at: string; ends_at: string | null; published: boolean; created_at: string;
};
type Draft = Omit<Announcement, 'id' | 'created_at'> & { id?: string; notify: boolean };

const TONE_CLASS: Record<Announcement['tone'], string> = {
  info: 'bg-surface-alt text-brand-dark',
  warning: 'bg-warning-bg text-warning',
  critical: 'bg-danger-bg text-danger',
};

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function stateOf(a: Announcement): { label: string; cls: string } {
  const now = Date.now();
  if (!a.published) return { label: 'Draft', cls: 'bg-surface-alt text-muted' };
  if (new Date(a.starts_at).getTime() > now) return { label: 'Scheduled', cls: 'bg-warning-bg text-warning' };
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return { label: 'Ended', cls: 'bg-surface-alt text-muted' };
  return { label: 'Live', cls: 'bg-success-bg text-success' };
}

const EMPTY: Draft = { title: '', body: '', audience: 'all', tone: 'info', starts_at: '', ends_at: null, published: true, notify: false };

export function AnnouncementsTab() {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setList((await api.get<{ announcements: Announcement[] }>('/admin/system-config/announcements')).announcements); setLoadErr(null); }
    catch (e) { setLoadErr((e as Error).message); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function save() {
    if (!draft) return;
    setBusy(true); setErr(null);
    const body = {
      ...draft,
      starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null,
      ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
    };
    try {
      if (draft.id) await api.patch(`/admin/system-config/announcements/${draft.id}`, body);
      else await api.post('/admin/system-config/announcements', body);
      setDraft(null);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(a: Announcement) {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    try { await api.delete(`/admin/system-config/announcements/${a.id}`); await load(); }
    catch (e) { setLoadErr((e as Error).message); }
  }

  const set = (patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setErr(null); };

  return (
    <div className="space-y-5">
      {draft ? (
        <section className="rounded-2xl bg-surface border border-line p-5 space-y-4 max-w-3xl">
          <h2 className="text-sm font-semibold text-ink">{draft.id ? 'Edit announcement' : 'New announcement'}</h2>
          <Field label="Title"><input value={draft.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} /></Field>
          <Field label="Message"><textarea value={draft.body} onChange={(e) => set({ body: e.target.value })} rows={3} className={inputClass} /></Field>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Audience">
              <select value={draft.audience} onChange={(e) => set({ audience: e.target.value as Draft['audience'] })} className={inputClass}>
                <option value="all">Everyone</option>
                <option value="officers">Group officers</option>
              </select>
            </Field>
            <Field label="Style">
              <select value={draft.tone} onChange={(e) => set({ tone: e.target.value as Draft['tone'] })} className={inputClass}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
            <Field label="Starts">
              <input type="datetime-local" value={draft.starts_at} onChange={(e) => set({ starts_at: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Ends (optional)">
              <input type="datetime-local" value={draft.ends_at ?? ''} onChange={(e) => set({ ends_at: e.target.value || null })} className={inputClass} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <Toggle on={draft.published} onChange={(on) => set({ published: on })} label="Published" />
            {draft.published && <Toggle on={draft.notify} onChange={(on) => set({ notify: on })} label="Also send as a notification" />}
          </div>
          {err && <div className="rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}
          <div className="flex gap-3">
            <button onClick={() => { setDraft(null); setErr(null); }} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-secondary">Cancel</button>
            <button onClick={save} disabled={busy || !draft.title.trim() || !draft.body.trim()}
              className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              {busy ? 'Saving…' : draft.id ? 'Save' : draft.published ? 'Publish' : 'Save draft'}
            </button>
          </div>
        </section>
      ) : (
        <button onClick={() => setDraft({ ...EMPTY, starts_at: toLocalInput(new Date().toISOString()) })}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white">
          <Plus size={15} /> New announcement
        </button>
      )}

      {!list ? <div className="py-10 text-center text-sm text-muted">{loadErr ?? 'Loading…'}</div>
        : list.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-line p-10 text-center text-sm text-muted">
            <Megaphone size={26} className="mx-auto mb-2 opacity-40" /> No announcements yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {list.map((a) => {
              const st = stateOf(a);
              return (
                <div key={a.id} className="rounded-2xl bg-surface border border-line p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{a.title}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${TONE_CLASS[a.tone]}`}>{a.tone}</span>
                      </div>
                      <p className="text-[13px] text-secondary mt-1.5 whitespace-pre-line">{a.body}</p>
                      <div className="text-[11px] text-muted mt-2">
                        {a.audience === 'officers' ? 'Group officers' : 'Everyone'} · {formatDateTime(a.starts_at)}{a.ends_at ? ` – ${formatDateTime(a.ends_at)}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button title="Edit" onClick={() => setDraft({ ...a, starts_at: toLocalInput(a.starts_at), ends_at: toLocalInput(a.ends_at) || null, notify: false })}
                        className="p-2 rounded-lg text-muted hover:bg-surface-alt hover:text-ink"><Pencil size={15} /></button>
                      <button title="Delete" onClick={() => remove(a)} className="p-2 rounded-lg text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
