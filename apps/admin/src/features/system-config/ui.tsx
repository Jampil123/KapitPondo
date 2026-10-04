/**
 * apps/admin/src/features/system-config/ui.tsx — small form pieces shared by
 * the System Configuration tabs.
 */
import { Save, RotateCcw, Check } from 'lucide-react';

export const inputClass = 'w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase text-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} className="inline-flex items-center gap-2 shrink-0">
      <span className={`relative w-10 h-6 rounded-full transition-colors ${on ? 'bg-success' : 'bg-line'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label ? <span className="text-[13px] text-ink">{label}</span> : <span className="text-xs text-muted w-12 text-left">{on ? 'On' : 'Off'}</span>}
    </button>
  );
}

export function SaveBar({ busy, err, saved, onSave, onReset }: { busy: boolean; err: string | null; saved: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={onSave} disabled={busy}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
        <Save size={14} /> {busy ? 'Saving…' : 'Save changes'}
      </button>
      <button onClick={onReset} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-muted hover:text-ink">
        <RotateCcw size={14} /> Discard
      </button>
      {saved && <span className="flex items-center gap-1 text-[13px] font-semibold text-success"><Check size={14} /> Saved</span>}
      {err && <span className="text-[13px] text-danger">{err}</span>}
    </div>
  );
}
