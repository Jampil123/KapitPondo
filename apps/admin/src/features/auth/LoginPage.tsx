/**
 * apps/admin/src/features/auth/LoginPage.tsx
 * Two-column admin sign-in matching the design: brand panel (left) + form (right).
 * Wired to AdminAuthContext.signIn (static Supabase admin account).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Users, PieChart, BarChart3 } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { TextField } from '../../components/ui/TextField';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Checkbox } from '../../components/ui/Checkbox';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import leftBackground from '../../assets/images/left-background.png';
import kpLogo from '../../assets/images/KP-Logo.png';

const FEATURES = [
  { icon: Users, title: 'Community', body: 'People first, always.' },
  { icon: ShieldCheck, title: 'Trust', body: 'We protect what matters.' },
  { icon: PieChart, title: 'Transparency', body: 'Open books, clear purpose.' },
  { icon: BarChart3, title: 'Growth', body: 'Stronger together.' },
];

export function LoginPage() {
  const { signIn } = useAdminAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { await signIn(email, password); nav('/'); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex h-full min-h-screen">
      {/* Left — brand */}
      <div className="hidden md:flex w-1/2 flex-col justify-between p-12 relative overflow-hidden"
           style={{
             backgroundImage: `url(${leftBackground})`,
             backgroundSize: 'cover',
             backgroundPosition: 'center',
           }}>
        <div className="flex flex-col items-center text-center gap-3 relative z-10">
          <img src={kpLogo} alt="KapitPondo" className="h-40 w-auto" />
          <div className="flex items-center gap-3 mt-1 opacity-70">
          </div>
        </div>

        <div className="flex flex-col items-center text-center gap-4 relative z-10 max-w-sm mx-auto mt-0">
          <h1 className="text-4xl font-bold text-ink leading-tight">Managing funds.<br />Building <span style={{ color: '#4f7595' }}>trust.</span></h1>
          <p className="text-[15px] text-secondary leading-relaxed">
            A community sinking-fund ledger and monitoring system built on transparency, accountability, and teamwork.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-2xl p-4 relative z-10 mt-50"
             style={{ background: 'rgba(34,49,66,0.55)', backdropFilter: 'blur(8px)' }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col items-center text-center gap-2 px-2">
              <f.icon size={26} color="#fff" strokeWidth={1.7} />
              <div className="text-sm font-semibold text-white">{f.title}</div>
              <div className="text-[11px] text-white/70 leading-snug">{f.body}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-ink/50 relative z-10 text-center" style={{ color: '#d8deec' }}>© 2026 KapitPondo. All rights reserved.</div>
      </div>

      {/* Right — form */}
      <div className="w-full md:w-1/2 bg-surface flex flex-col">
        <div className="flex-1 flex items-center justify-center px-10">
          <form onSubmit={onSubmit} className="w-full max-w-md">
            <h2 className="text-4xl font-bold text-ink leading-tight">Welcome back,</h2>
            <h2 className="text-4xl font-bold text-brand leading-tight"style={{ color: '#4f7595' }}>KapitPondo Team</h2>
            <p className="text-secondary mt-3 mb-8">Sign in to continue to the administrator dashboard.</p>

            {err && <ErrorBanner>{err}</ErrorBanner>}

            <label className="block text-xs font-semibold text-secondary mb-1.5">Email Address</label>
            <div className="mb-4">
              <TextField icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
                         placeholder="you@kapitpondo.ph" />
            </div>

            <label className="block text-xs font-semibold text-secondary mb-1.5">Password</label>
            <div className="mb-4">
              <TextField
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={show ? 'text' : 'password'}
                required
                placeholder="Enter your password"
                endAdornment={
                  <button type="button" onClick={() => setShow((v) => !v)} className="text-muted">
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </div>

            <div className="flex items-center justify-between mb-6">
              <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-sm font-semibold text-brand-dark hover:opacity-80"
              >
                Forgot password?
              </button>
            </div>

            <PrimaryButton disabled={busy} busy={busy} busyLabel="Signing in…">
              Sign in
            </PrimaryButton>

            <div className="flex items-center justify-center gap-2 mt-6">
              <Lock size={14} className="text-muted" />
              <span className="text-xs text-muted">All administrator credentials are encrypted and protected.</span>
            </div>
          </form>
        </div>
      </div>

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
    </div>
  );
}