/**
 * apps/admin/src/features/system-config/PoliciesTab.tsx — versioned system
 * policies (Terms of Service, Privacy Policy, Community Guidelines). The
 * newest published version of each is what the member app shows. Published
 * versions are permanent; only drafts can be deleted.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Send, Trash2, FileText } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Field, inputClass } from './ui';

type Kind = 'terms' | 'privacy' | 'community';
type Policy = { id: string; kind: Kind; title: string; body: string; version: string; published_at: string | null; created_at: string };

const KINDS: { key: Kind; label: string }[] = [
  { key: 'terms', label: 'Terms of Service' },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'community', label: 'Community Guidelines' },
];

export function PoliciesTab() {
  const [kind, setKind] = useState<Kind>('terms');
  const [list, setList] = useState<Policy[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; version: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    try { setList((await api.get<{ policies: Policy[] }>('/admin/system-config/policies')).policies); setLoadErr(null); }
    catch (e) { setLoadErr((e as Error).message); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const versions = useMemo(() => (list ?? []).filter((p) => p.kind === kind), [list, kind]);
  const live = versions.filter((p) => p.published_at).sort((a, b) => b.published_at!.localeCompare(a.published_at!))[0];

  function startNew() {
    const label = KINDS.find((k) => k.key === kind)!.label;
    // Start from the live text so an update is an edit, not a rewrite.
    setDraft({ title: live?.title ?? label, version: '', body: live?.body ?? '' });
    setErr(null);
  }

  async function create(publish: boolean) {
    if (!draft) return;
    setBusy(true); setErr(null);
    try { await api.post('/admin/system-config/policies', { kind, ...draft, publish }); setDraft(null); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function publish(p: Policy) {
    if (!window.confirm(`Publish version ${p.version}? It becomes the live ${KINDS.find((k) => k.key === p.kind)!.label}.`)) return;
    try { await api.post(`/admin/system-config/policies/${p.id}/publish`); await load(); } catch (e) { setLoadErr((e as Error).message); }
  }
  async function remove(p: Policy) {
    if (!window.confirm(`Delete draft ${p.version}?`)) return;
    try { await api.delete(`/admin/system-config/policies/${p.id}`); await load(); } catch (e) { setLoadErr((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => { setKind(k.key); setDraft(null); }}
            className={`px-4 py-2 rounded-full text-sm font-semibold border ${kind === k.key ? 'border-brand bg-surface-alt text-brand-dark' : 'border-line bg-surface text-muted'}`}>
            {k.label}
          </button>
        ))}
      </div>

      {draft ? (
        <section className="rounded-2xl bg-surface border border-line p-5 space-y-4 max-w-4xl">
          <h2 className="text-sm font-semibold text-ink">New version</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Field label="Title"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} /></Field></div>
            <Field label="Version"><input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="e.g. 2026-10" className={inputClass} /></Field>
          </div>
          <Field label="Text">
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={16}
              placeholder={'Write the policy. Blank lines separate paragraphs.'} className={`${inputClass} font-mono text-[12.5px] leading-relaxed`} />
          </Field>
          {err && <div className="rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{err}</div>}
          <div className="flex gap-3">
            <button onClick={() => setDraft(null)} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-secondary">Cancel</button>
            <button onClick={() => create(false)} disabled={busy} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-brand-dark disabled:opacity-50">Save draft</button>
            <button onClick={() => create(true)} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Publish'}
            </button>
          </div>
        </section>
      ) : (
        <button onClick={startNew} className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white">
          <Plus size={15} /> New version
        </button>
      )}

      {!list ? <div className="py-10 text-center text-sm text-muted">{loadErr ?? 'Loading…'}</div>
        : versions.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-line p-10 text-center text-sm text-muted">
            <FileText size={26} className="mx-auto mb-2 opacity-40" />
            No versions yet{kind === 'privacy' ? ' — the app shows its built-in Privacy Policy until one is published.' : '.'}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line">
            {versions.map((p) => (
              <div key={p.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setOpenId(openId === p.id ? null : p.id)} className="min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{p.title}</span>
                      <span className="text-xs text-muted">v{p.version}</span>
                      {p.id === live?.id ? <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-success-bg text-success">Live</span>
                        : !p.published_at ? <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-warning-bg text-warning">Draft</span>
                        : <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-surface-alt text-muted">Superseded</span>}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {p.published_at ? `Published ${formatDateTime(p.published_at)}` : `Drafted ${formatDateTime(p.created_at)}`}
                    </div>
                  </button>
                  {!p.published_at && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => publish(p)} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"><Send size={12} /> Publish</button>
                      <button title="Delete draft" onClick={() => remove(p)} className="p-2 rounded-lg text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
                {openId === p.id && <div className="mt-3 rounded-xl bg-surface-alt p-4 text-[13px] text-secondary whitespace-pre-line max-h-96 overflow-y-auto">{p.body}</div>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
