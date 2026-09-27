/**
 * constants/verificationStatus.ts
 * ----------------------------------------------------------------------------
 * Shared per-status copy/icon/tone for a member's identity verification,
 * plus where a "do something about it" button should lead. Originally lived
 * only in ProfileBody.tsx; pulled out so any other screen gating a feature on
 * verification (e.g. groups/create.tsx) shows the exact same status and
 * wording instead of inventing its own.
 */
import { Check, Clock, AlertTriangle, RotateCcw, XCircle, type LucideIcon } from 'lucide-react-native';
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
  resubmission_required: { icon: RotateCcw, tone: 'warning', title: 'Requires re-submission', subtitle: (r) => r ?? 'Please fix your ID details and submit again.', unlocks: true, btn: 'Resubmit my ID' },
  // Final — no resubmit button.
  rejected: { icon: XCircle, tone: 'danger', title: 'Verification rejected', subtitle: (r) => r ?? 'Your ID was not accepted.', unlocks: false, btn: '' },
};

// Pending already has a submission in review — its button reviews that
// instead of restarting the capture flow. Every other actionable status
// (unverified, resubmission_required) goes to the capture flow's own start
// screen. Rejected is final and has no button.
export function verifyDestination(status: VerificationStatus): '/(app)/my-submission' | '/(app)/verify-landing' {
  return status === 'pending' ? '/(app)/my-submission' : '/(app)/verify-landing';
}
