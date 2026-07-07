/**
 * apps/admin/src/features/settings/SettingsPage.tsx
 * No settings backend exists yet — shows the signed-in admin's own account
 * info (real, from AdminAuthContext) plus honest "coming soon" placeholders
 * for the rest, rather than faking controls that don't do anything.
 */
import { ShieldCheck, Bell, Lock, User, type LucideIcon } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';

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
        <Row icon={Lock} title="Change password" body="Update the password for this admin account." />
      </Section>

      <Section icon={Bell} title="Notifications" subtitle="Platform event alerts">
        <Row icon={Bell} title="Notification preferences" body="Choose which platform events email or notify you." />
      </Section>
    </div>
  );
}
