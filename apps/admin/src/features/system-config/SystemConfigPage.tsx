/**
 * apps/admin/src/features/system-config/SystemConfigPage.tsx — System
 * Configuration: the System Administrator's limited, platform-level settings
 * (migration 0066, services/api modules/systemConfig).
 *
 *   Announcements          — platform notices shown in the member app
 *   Notification templates — reword the platform's own notifications
 *   Categories             — complaint categories members file under
 *   Verification           — accepted IDs and what a submission must include
 *   Policies               — versioned Terms / Privacy / Community policies
 *
 * Nothing here reaches into a fund group's money or records.
 */
import { useEffect, useState } from 'react';
import { Megaphone, BellRing, Tags, IdCard, FileText, Plus, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { AnnouncementsTab } from './AnnouncementsTab';
import { PoliciesTab } from './PoliciesTab';
import { Field, Toggle, inputClass, SaveBar } from './ui';

type IdType = { value: string; label: string; active: boolean };
type Verification = { accepted_id_types: IdType[]; require_id_back: boolean; require_selfie: boolean; minimum_age: number };
type Category = { key: string; label: string; active: boolean };
type TemplateDef = { type: string; label: string; vars: string[]; title: string; message: string };
type Templates = Record<string, { title: string; message: string }>;
type Config = {
  settings: { verification_requirements: Verification; complaint_categories: Category[]; notification_templates: Templates };
  template_defs: TemplateDef[];
};

const TABS = [
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'templates', label: 'Notification templates', icon: BellRing },
  { key: 'categories', label: 'Categories', icon: Tags },
  { key: 'verification', label: 'Verification', icon: IdCard },
  { key: 'policies', label: 'Policies', icon: FileText },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function SystemConfigPage() {
  const [tab, setTab] = useState<Tab>('announcements');
  const [config, setConfig] = useState<Config | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  async function load() {
    try { setConfig(await api.get<Config>('/admin/system-config')); setLoadErr(null); }
    catch (e) { setLoadErr((e as Error).message); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-8xl px-8 pt-6 pb-8">
      <div className="inline-flex flex-wrap items-center gap-1 bg-surface-alt rounded-xl p-1 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'announcements' ? <AnnouncementsTab />
        : tab === 'policies' ? <PoliciesTab />
        : !config ? <div className="py-16 text-center text-sm text-muted">{loadErr ?? 'Loading…'}</div>
        : tab === 'verification' ? <VerificationTab initial={config.settings.verification_requirements} onSaved={load} />
        : tab === 'categories' ? <CategoriesTab initial={config.settings.complaint_categories} onSaved={load} />
        : <TemplatesTab defs={config.template_defs} initial={config.settings.notification_templates} onSaved={load} />}
    </div>
  );
}

// Shared save flow for the three settings tabs.
function useSave(key: string, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function save(value: unknown) {
    setBusy(true); setErr(null); setSaved(false);
    try { await api.put(`/admin/system-config/${key}`, { value }); setSaved(true); onSaved(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return { busy, err, saved, save, clear: () => { setSaved(false); setErr(null); } };
}

// --- Verification requirements ------------------------------------------------

function VerificationTab({ initial, onSaved }: { initial: Verification; onSaved: () => void }) {
  const [v, setV] = useState<Verification>(initial);
  const [newType, setNewType] = useState('');
  const s = useSave('verification_requirements', onSaved);
  const set = (patch: Partial<Verification>) => { setV((x) => ({ ...x, ...patch })); s.clear(); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <section className="rounded-2xl bg-surface border border-line p-5">
        <h2 className="text-sm font-semibold text-ink mb-1">Accepted ID types</h2>
        <p className="text-xs text-muted mb-4">Members can only submit these. Switching one off doesn't affect accounts already verified with it.</p>
        <div className="divide-y divide-line">
          {v.accepted_id_types.map((t, i) => (
            <div key={t.value} className="flex items-center gap-3 py-2.5">
              <input value={t.label} className={`${inputClass} flex-1`}
                onChange={(e) => set({ accepted_id_types: v.accepted_id_types.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Toggle on={t.active} onChange={(on) => set({ accepted_id_types: v.accepted_id_types.map((x, j) => (j === i ? { ...x, active: on } : x)) })} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Add an ID type, e.g. Postal ID" className={`${inputClass} flex-1`} />
          <button disabled={!newType.trim()} onClick={() => { set({ accepted_id_types: [...v.accepted_id_types, { value: '', label: newType.trim(), active: true }] }); setNewType(''); }}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-brand-dark disabled:opacity-40">
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-surface border border-line p-5 space-y-4 self-start">
        <h2 className="text-sm font-semibold text-ink">Submission requirements</h2>
        <Field label="Photo of the back of the ID">
          <Toggle on={v.require_id_back} onChange={(on) => set({ require_id_back: on })} label="Required" />
        </Field>
        <Field label="Selfie">
          <Toggle on={v.require_selfie} onChange={(on) => set({ require_selfie: on })} label="Required" />
        </Field>
        <Field label="Minimum age">
          <input type="number" min={0} max={100} value={v.minimum_age} className={`${inputClass} w-28`}
            onChange={(e) => set({ minimum_age: Number(e.target.value) })} />
        </Field>
      </section>

      <div className="xl:col-span-2">
        <SaveBar busy={s.busy} err={s.err} saved={s.saved} onSave={() => s.save(v)} onReset={() => { setV(initial); s.clear(); }} />
      </div>
    </div>
  );
}

// --- Complaint categories ------------------------------------------------------

function CategoriesTab({ initial, onSaved }: { initial: Category[]; onSaved: () => void }) {
  const [list, setList] = useState<Category[]>(initial);
  const [newLabel, setNewLabel] = useState('');
  const s = useSave('complaint_categories', onSaved);
  const update = (next: Category[]) => { setList(next); s.clear(); };

  return (
    <section className="rounded-2xl bg-surface border border-line p-5 max-w-2xl">
      <h2 className="text-sm font-semibold text-ink mb-1">Complaint categories</h2>
      <p className="text-xs text-muted mb-4">What members can file a complaint under. A category in use can be switched off, not deleted.</p>
      <div className="divide-y divide-line">
        {list.map((c, i) => (
          <div key={c.key || i} className="flex items-center gap-3 py-2.5">
            <input value={c.label} className={`${inputClass} flex-1`}
              onChange={(e) => update(list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <Toggle on={c.active} onChange={(on) => update(list.map((x, j) => (j === i ? { ...x, active: on } : x)))} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3 mb-5">
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New category" className={`${inputClass} flex-1`} />
        <button disabled={!newLabel.trim()} onClick={() => { update([...list, { key: '', label: newLabel.trim(), active: true }]); setNewLabel(''); }}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-brand-dark disabled:opacity-40">
          <Plus size={14} /> Add
        </button>
      </div>
      <SaveBar busy={s.busy} err={s.err} saved={s.saved} onSave={() => s.save(list)} onReset={() => { setList(initial); s.clear(); }} />
    </section>
  );
}

// --- Notification templates ----------------------------------------------------

function TemplatesTab({ defs, initial, onSaved }: { defs: TemplateDef[]; initial: Templates; onSaved: () => void }) {
  const start = () => Object.fromEntries(defs.map((d) => [d.type, initial[d.type] ?? { title: d.title, message: d.message }]));
  const [t, setT] = useState<Templates>(start);
  const s = useSave('notification_templates', onSaved);
  const set = (type: string, patch: Partial<{ title: string; message: string }>) => { setT((x) => ({ ...x, [type]: { ...x[type], ...patch } })); s.clear(); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {defs.map((d) => {
          const cur = t[d.type];
          const custom = cur.title !== d.title || cur.message !== d.message;
          return (
            <section key={d.type} className="rounded-2xl bg-surface border border-line p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{d.label}</h2>
                  <div className="text-[11px] text-muted">
                    {d.vars.length ? <>Placeholders: {d.vars.map((v) => <code key={v} className="mr-1.5 rounded bg-surface-alt px-1">{`{${v}}`}</code>)}</> : 'No placeholders'}
                  </div>
                </div>
                {custom && (
                  <button onClick={() => set(d.type, { title: d.title, message: d.message })}
                    className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
                    <RotateCcw size={12} /> Default
                  </button>
                )}
              </div>
              <input value={cur.title} onChange={(e) => set(d.type, { title: e.target.value })} className={inputClass} />
              <textarea value={cur.message} onChange={(e) => set(d.type, { message: e.target.value })} rows={2} className={inputClass} />
            </section>
          );
        })}
      </div>
      <SaveBar busy={s.busy} err={s.err} saved={s.saved} onSave={() => s.save(t)} onReset={() => { setT(start()); s.clear(); }} />
    </div>
  );
}

