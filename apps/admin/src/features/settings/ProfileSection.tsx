/**
 * apps/admin/src/features/settings/ProfileSection.tsx — view and edit the
 * signed-in admin's name, phone and photo (GET/PATCH /admin/account,
 * PUT /admin/account/photo). Email is the sign-in identity, so it's read-only.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Pencil, Phone, Trash2, User } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { TextField } from '../../components/ui/TextField';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

export type AdminAccount = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

const PHOTO_PX = 256;

// Square-crops and shrinks the picked image so the upload stays small.
function toSquareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = PHOTO_PX;
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX);
      URL.revokeObjectURL(src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('That file isn’t an image we can read.')); };
    img.src = src;
  });
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase text-muted mb-1">{label}</div>
      <div className="text-[15px] font-medium text-ink break-all">{value}</div>
    </div>
  );
}

// `children` renders inside the Personal information card, under the details
// (Settings puts the sessions list there).
export function ProfileSection({ children }: { children?: React.ReactNode }) {
  const { updateAdmin } = useAdminAuth();
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<AdminAccount>('/admin/account')
      .then(setAccount)
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Failed to load your profile.'));
  }, []);

  function apply(a: AdminAccount) {
    setAccount(a);
    updateAdmin({ full_name: a.full_name, avatar_url: a.avatar_url });
  }

  function startEdit() {
    if (!account) return;
    setName(account.full_name);
    setPhone(account.phone ?? '');
    setErr(null);
    setEditing(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy('save');
    try {
      apply(await api.patch<AdminAccount>('/admin/account', { full_name: name, phone }));
      setEditing(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save your profile.');
    } finally {
      setBusy(null);
    }
  }

  async function setPhoto(file: File | null) {
    setErr(null);
    setBusy('photo');
    try {
      const data_url = file ? await toSquareJpeg(file) : null;
      apply(await api.put<AdminAccount>('/admin/account/photo', { data_url }));
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : 'Failed to update your photo.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!account) {
    return (
      <div className="rounded-2xl bg-surface border border-line px-5 py-4">
        {err ? <ErrorBanner>{err}</ErrorBanner> : <span className="text-sm text-muted">Loading…</span>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-stretch">
      {/* Left — photo card */}
      <div className="rounded-2xl bg-surface border border-line px-8 py-12 flex flex-col items-center justify-center text-center">
        <div className="relative mb-5">
          <Avatar name={account.full_name} email={account.email} url={account.avatar_url} size={260}
                  className="ring-4 ring-surface-alt" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null}
                  aria-label={account.avatar_url ? 'Change photo' : 'Upload photo'}
                  className="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center shadow-md hover:opacity-90 disabled:opacity-60">
            <Camera size={18} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
               onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />

        <div className="text-3xl font-bold text-ink leading-tight">{account.full_name}</div>
        <div className="mt-1 text-[15px] text-muted break-all">{account.email ?? '—'}</div>
        <span className="mt-3 rounded-full bg-surface-alt text-brand-dark text-[11px] font-semibold px-3 py-1">
          System administrator
        </span>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-alt disabled:opacity-60">
            <Camera size={14} /> {busy === 'photo' ? 'Uploading…' : account.avatar_url ? 'Change photo' : 'Upload photo'}
          </button>
          {account.avatar_url && (
            <button type="button" onClick={() => setPhoto(null)} disabled={busy !== null}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-60">
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted">PNG, JPG or WebP · up to 2 MB</p>
      </div>

      {/* Right — details / edit form */}
      <div className="rounded-2xl bg-surface border border-line px-7 py-7 flex flex-col">
        {err && <ErrorBanner>{err}</ErrorBanner>}

        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="text-lg font-semibold text-ink">{editing ? 'Edit profile' : 'Personal information'}</div>
          {!editing && (
            <button type="button" onClick={startEdit}
                    className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
              <Pencil size={13} /> Edit profile
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={onSave} className="max-w-md">
            <label className="block text-xs font-semibold text-secondary mb-1.5">Full name</label>
            <div className="mb-3">
              <TextField icon={User} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
            </div>
            <label className="block text-xs font-semibold text-secondary mb-1.5">Phone</label>
            <div className="mb-5">
              <TextField icon={Phone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="e.g. 0917 123 4567" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy !== null}
                      className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setErr(null); }}
                      className="rounded-lg border border-line-strong px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-alt">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-x-8 gap-y-6">
            <Detail label="Full name" value={account.full_name} />
            <Detail label="Email" value={account.email ?? '—'} />
            <Detail label="Phone" value={account.phone ?? '—'} />
            <Detail label="Role" value="System administrator" />
            <Detail label="Admin since" value={formatDate(account.created_at)} />
            <Detail label="Last sign-in" value={formatDateTime(account.last_sign_in_at)} />
          </div>
        )}

        {children && <div className="mt-7 pt-6 border-t border-line flex-1">{children}</div>}
      </div>
    </div>
  );
}
