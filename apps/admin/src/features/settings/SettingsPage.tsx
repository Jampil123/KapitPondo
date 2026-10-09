/**
 * apps/admin/src/features/settings/SettingsPage.tsx
 * The signed-in admin's account: profile (ProfileSection) and sessions &
 * sign-in history (SessionsSection). Password (PasswordSection) and the
 * recovery-questions form open as dialogs from links on the photo card.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Lock, KeyRound, type LucideIcon } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { TextField } from '../../components/ui/TextField';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Dialog } from '../../components/ui/Dialog';
import { ProfileSection } from './ProfileSection';
import { PasswordSection } from './PasswordSection';
import { SessionsSection } from './SessionsSection';

type SecurityQuestions = { question_1: string | null; question_2: string | null; updated_at: string | null };

function SecurityQuestionsForm() {
  const [current, setCurrent] = useState<SecurityQuestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [q1, setQ1] = useState('');
  const [a1, setA1] = useState('');
  const [q2, setQ2] = useState('');
  const [a2, setA2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<SecurityQuestions>('/admin/security-questions')
      .then((d) => {
        setCurrent(d);
        setQ1(d.question_1 ?? '');
        setQ2(d.question_2 ?? '');
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Failed to load recovery questions.'))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (q1.trim().toLowerCase() === q2.trim().toLowerCase()) {
      setErr('Choose two different questions.');
      return;
    }
    setBusy(true);
    try {
      await api.put('/admin/security-questions', { question_1: q1, answer_1: a1, question_2: q2, answer_2: a2 });
      setCurrent({ question_1: q1, question_2: q2, updated_at: new Date().toISOString() });
      setSaved(true);
      setEditing(false);
      setA1('');
      setA2('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save recovery questions.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  const configured = !!current?.question_1 && !!current?.question_2;

  if (!editing) {
    return (
      <div>
        {saved && (
          <div className="mb-4 rounded-lg bg-success-bg text-success text-sm px-3 py-2">
            Recovery questions saved.
          </div>
        )}
        {configured ? (
          <>
            <div className="text-[11px] font-semibold uppercase text-muted mb-1">Question 1</div>
            <div className="text-[15px] font-medium text-ink mb-5">{current!.question_1}</div>
            <div className="text-[11px] font-semibold uppercase text-muted mb-1">Question 2</div>
            <div className="text-[15px] font-medium text-ink mb-6">{current!.question_2}</div>
          </>
        ) : (
          <p className="text-sm text-muted mb-4">
            Not set up yet. Since this account doesn't use a real inbox, password recovery relies on security
            questions instead of an email link — set them up now so you're not locked out later.
          </p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          {configured ? 'Change questions' : 'Set up recovery questions'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {err && <ErrorBanner>{err}</ErrorBanner>}

      <label className="block text-xs font-semibold text-secondary mb-1.5">Question 1</label>
      <div className="mb-3">
        <TextField icon={KeyRound} value={q1} onChange={(e) => setQ1(e.target.value)} required
                   placeholder="e.g. What was your first pet's name?" />
      </div>
      <label className="block text-xs font-semibold text-secondary mb-1.5">Answer 1</label>
      <div className="mb-4">
        <TextField icon={Lock} value={a1} onChange={(e) => setA1(e.target.value)} required placeholder="Answer" />
      </div>

      <label className="block text-xs font-semibold text-secondary mb-1.5">Question 2</label>
      <div className="mb-3">
        <TextField icon={KeyRound} value={q2} onChange={(e) => setQ2(e.target.value)} required
                   placeholder="e.g. What city were you born in?" />
      </div>
      <label className="block text-xs font-semibold text-secondary mb-1.5">Answer 2</label>
      <div className="mb-5">
        <TextField icon={Lock} value={a2} onChange={(e) => setA2(e.target.value)} required placeholder="Answer" />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setErr(null);
            setQ1(current?.question_1 ?? '');
            setQ2(current?.question_2 ?? '');
            setA1('');
            setA2('');
          }}
          className="rounded-lg border border-line-strong px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-alt"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Row link for the photo card: icon, label beside it, arrow at the end.
function ActionRow({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
            className="group w-full flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:bg-surface-alt">
      <span className="w-9 h-9 rounded-lg bg-surface-alt flex items-center justify-center shrink-0 group-hover:bg-surface">
        <Icon size={17} className="text-brand-dark" />
      </span>
      <span className="flex-1 text-sm font-semibold text-ink">{children}</span>
      <span className="w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center shrink-0 transition-transform group-hover:translate-x-0.5">
        <ArrowRight size={15} />
      </span>
    </button>
  );
}

export function SettingsPage() {
  const [dialog, setDialog] = useState<'password' | 'recovery' | null>(null);
  const close = useCallback(() => setDialog(null), []);

  return (
    <div className="w-full px-8 pt-6 pb-8">
      <ProfileSection actions={
        <>
          <ActionRow icon={Lock} onClick={() => setDialog('password')}>Change password</ActionRow>
          <ActionRow icon={KeyRound} onClick={() => setDialog('recovery')}>Account recovery</ActionRow>
        </>
      }>
        <SessionsSection />
      </ProfileSection>

      <Dialog open={dialog === 'password'} onClose={close} icon={Lock} title="Password" subtitle="Change the password you sign in with">
        <PasswordSection />
      </Dialog>

      <Dialog open={dialog === 'recovery'} onClose={close} icon={KeyRound} title="Account Recovery" subtitle="Security questions used to reset a forgotten password">
        <SecurityQuestionsForm />
      </Dialog>
    </div>
  );
}
