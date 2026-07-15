/**
 * apps/admin/src/features/settings/SettingsPage.tsx
 * Shows the signed-in admin's own account info (real, from AdminAuthContext),
 * a real recovery-questions form (wired to services/api), and honest
 * "coming soon" placeholders for the rest, rather than faking controls that
 * don't do anything.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, Bell, Lock, User, KeyRound, type LucideIcon } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { api, ApiError } from '../../lib/api';
import { TextField } from '../../components/ui/TextField';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

type SecurityQuestions = { question_1: string | null; question_2: string | null; updated_at: string | null };

function Row({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-line last:border-0">
      <div className="w-9 h-9 rounded-lg bg-surface-alt flex items-center justify-center shrink-0">
        <Icon size={17} className="text-brand-dark" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-xs text-muted">{body}</div>
      </div>
      <span className="text-[11px] text-muted">Coming soon</span>
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, children }: { icon: LucideIcon; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-surface-alt flex items-center justify-center shrink-0">
          <Icon size={16} className="text-brand-dark" />
        </div>
        <div>
          <div className="text-[13.5px] font-semibold text-ink">{title}</div>
          <div className="text-[11px] text-muted">{subtitle}</div>
        </div>
      </div>
      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        {children}
      </div>
    </div>
  );
}

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

  if (loading) return <div className="px-5 py-4 text-sm text-muted">Loading…</div>;

  const configured = !!current?.question_1 && !!current?.question_2;

  if (!editing) {
    return (
      <div className="px-5 py-4">
        {saved && (
          <div className="mb-3 rounded-lg bg-green-50 text-green-700 text-xs px-3 py-2">
            Recovery questions saved.
          </div>
        )}
        {configured ? (
          <>
            <div className="text-xs text-muted mb-1">Question 1</div>
            <div className="text-sm text-ink mb-3">{current!.question_1}</div>
            <div className="text-xs text-muted mb-1">Question 2</div>
            <div className="text-sm text-ink mb-4">{current!.question_2}</div>
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
    <form onSubmit={onSubmit} className="px-5 py-4">
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

export function SettingsPage() {
  const { admin } = useAdminAuth();

  return (
    <div className="mx-auto max-w-3xl px-8 pt-6 pb-8">
      <Section icon={User} title="Account" subtitle="This admin's identity">
        <div className="px-5 py-4">
          <div className="text-xs text-muted mb-1">Signed in as</div>
          <div className="text-sm font-medium text-ink">{admin?.email ?? admin?.user_id}</div>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="Security" subtitle="Access & sign-in policy">
        <Row icon={ShieldCheck} title="Two-factor authentication" body="Add an extra layer of security to admin sign-in." />
      </Section>

      <Section icon={KeyRound} title="Account Recovery" subtitle="Security questions used to reset a forgotten password">
        <SecurityQuestionsForm />
      </Section>

      <Section icon={Bell} title="Notifications" subtitle="Platform event alerts">
        <Row icon={Bell} title="Notification preferences" body="Choose which platform events email or notify you." />
      </Section>
    </div>
  );
}
