/**
 * apps/admin/src/features/auth/ForgotPasswordModal.tsx
 * Security-question password recovery, as a modal over LoginPage (backdrop
 * blurs the login screen behind it) instead of a separate route. The admin
 * account (admin@kapitpondo.local) has no real inbox, so email-link reset
 * can't reach it — this verifies two security answers server-side
 * (services/api /admin/recover/*) and sets the new password directly.
 */
import { useEffect, useState } from 'react';
import { X, Mail, Lock, KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { TextField } from '../../components/ui/TextField';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

type Step = 'email' | 'answer' | 'done';

export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [question1, setQuestion1] = useState('');
  const [question2, setQuestion2] = useState('');
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (step !== 'done') return;
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [step, onClose]);

  async function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const qs = await api.get<{ question_1: string; question_2: string }>(
        `/admin/recover/questions?email=${encodeURIComponent(email)}`
      );
      setQuestion1(qs.question_1);
      setQuestion2(qs.question_2);
      setStep('answer');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitAnswers(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/admin/recover/reset', {
        email,
        answer_1: answer1,
        answer_2: answer2,
        new_password: password,
      });
      setStep('done');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-surface shadow-2xl p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted hover:text-ink"
        >
          <X size={20} />
        </button>

        {step === 'done' ? (
          <div className="text-center py-4">
            <h2 className="text-2xl font-bold text-ink leading-tight mb-3">Password updated</h2>
            <p className="text-secondary">You can now sign in with your new password.</p>
          </div>
        ) : step === 'email' ? (
          <form onSubmit={onSubmitEmail}>
            <h2 className="text-2xl font-bold text-ink leading-tight">Forgot password?</h2>
            <p className="text-secondary mt-2 mb-6 text-sm">
              Enter your administrator email to answer your recovery questions.
            </p>

            {err && <ErrorBanner>{err}</ErrorBanner>}

            <label className="block text-xs font-semibold text-secondary mb-1.5">Email Address</label>
            <div className="mb-6">
              <TextField icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
                         placeholder="admin@kapitpondo.local" />
            </div>

            <PrimaryButton disabled={busy} busy={busy} busyLabel="Checking…">
              Continue
            </PrimaryButton>
          </form>
        ) : (
          <form onSubmit={onSubmitAnswers}>
            <h2 className="text-2xl font-bold text-ink leading-tight">Answer to continue</h2>
            <p className="text-secondary mt-2 mb-6 text-sm">Answer both questions and choose a new password.</p>

            {err && <ErrorBanner>{err}</ErrorBanner>}

            <label className="block text-xs font-semibold text-secondary mb-1.5">{question1}</label>
            <div className="mb-4">
              <TextField icon={KeyRound} value={answer1} onChange={(e) => setAnswer1(e.target.value)} required
                         placeholder="Your answer" />
            </div>

            <label className="block text-xs font-semibold text-secondary mb-1.5">{question2}</label>
            <div className="mb-4">
              <TextField icon={KeyRound} value={answer2} onChange={(e) => setAnswer2(e.target.value)} required
                         placeholder="Your answer" />
            </div>

            <label className="block text-xs font-semibold text-secondary mb-1.5">New Password</label>
            <div className="mb-4">
              <TextField
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={show ? 'text' : 'password'}
                required
                placeholder="At least 8 characters"
                endAdornment={
                  <button type="button" onClick={() => setShow((v) => !v)} className="text-muted">
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </div>

            <label className="block text-xs font-semibold text-secondary mb-1.5">Confirm Password</label>
            <div className="mb-6">
              <TextField icon={Lock} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                         type={show ? 'text' : 'password'} required placeholder="Re-enter password" />
            </div>

            <PrimaryButton disabled={busy} busy={busy} busyLabel="Updating…">
              Update password
            </PrimaryButton>

            <button
              type="button"
              onClick={() => { setStep('email'); setErr(null); }}
              className="mt-5 flex w-full items-center justify-center gap-2 text-sm font-semibold text-brand-dark hover:opacity-80"
            >
              <ArrowLeft size={16} /> Start over
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
