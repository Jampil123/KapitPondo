/**
 * constants/verificationStatus.ts
 * ----------------------------------------------------------------------------
 * Shared per-status copy/icon/tone for a member's identity verification,
 * plus where a "do something about it" button should lead. Originally lived
 * only in ProfileBody.tsx; pulled out so any other screen gating a feature on
 * verification (e.g. groups/create.tsx) shows the exact same status and
 * wording instead of inventing its own.
 */
import { Check, Clock, AlertTriangle, type LucideIcon } from 'lucide-react-native';
import type { IntentName } from '../theme/colors';
import type { VerificationStatus } from '../api/members';

export const VERIFY_META: Record<VerificationStatus, {
  icon: LucideIcon;
  tone: IntentName;
  title: string;
  subtitle: (reason: string | null) => string;
  unlocks: boolean;
  btn: string;
}> = {
  verified: { icon: Check, tone: 'success', title: 'Account verified', subtitle: () => 'Full access to loans, group creation and officer roles', unlocks: false, btn: '' },
  pending: { icon: Clock, tone: 'info', title: 'ID under review', subtitle: () => 'Usually reviewed within 2 working days', unlocks: true, btn: 'View what I submitted' },
  unverified: { icon: AlertTriangle, tone: 'warning', title: 'Basic account', subtitle: () => 'You can join groups and contribute. Verify to unlock the rest.', unlocks: true, btn: 'Verify my account' },
  rejected: { icon: AlertTriangle, tone: 'danger', title: 'ID could not be verified', subtitle: (r) => r ?? 'Your ID was not accepted. You can submit a new one.', unlocks: true, btn: 'Submit a new ID' },
};

// Pending already has a submission in review — its button reviews that
// instead of restarting the capture flow. Every other actionable status
// (unverified, rejected) goes to the capture flow's own start screen.
export function verifyDestination(status: VerificationStatus): '/(app)/my-submission' | '/(app)/verify-start' {
  return status === 'pending' ? '/(app)/my-submission' : '/(app)/verify-start';
}
