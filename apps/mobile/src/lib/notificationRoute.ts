// Where tapping a notification (list row, in-app toast or phone push) takes
// the member: the screen where they can act on it or see the result.

type NotificationTarget = {
  type: string;
  group_id: string | null;
  data?: Record<string, unknown> | null;
};

type Route = { pathname: string; params?: Record<string, string> };

// Screens under /(app)/[groupId]/…, by notification type.
const GROUP_SCREEN: Record<string, string> = {
  // officer to-dos: the role-aware sign-off queue
  'contribution.to_confirm': 'signoffs',
  'contribution.to_verify': 'signoffs',
  'loan.repayment_to_confirm': 'signoffs',
  'loan.repayment_to_verify': 'signoffs',
  'loan.to_review': 'signoffs',
  'loan.to_release': 'signoffs',
  'loan.release_to_verify': 'signoffs',
  'loan.sent_back': 'loans/decisions',

  // cash an officer recorded for the member
  'contribution.walk_in_recorded': 'recorded-for-me',
  'loan.walk_in_recorded': 'recorded-for-me',

  // the member's own money
  'contribution.rejected': 'contributions',
  'payment.reminder': 'contributions',
  'balance.nudge': 'contributions',
  'penalty.charged': 'contributions',
  'penalty.waived': 'contributions',
  'loan.approved': 'loans/my-loan',
  'loan.disbursed': 'loans/my-loan',
  'loan.rejected': 'loans/my-loan',
  'loan.repayment_confirmed': 'loans/repayments',
  'loan.repayment_rejected': 'loans/repayments',
  'ledger.reversed': 'reports/my-transactions',
  'distribution.finalized': 'distribution/year-end',

  // group
  'gcash.proposed': 'group/settings',
  'gcash.approved': 'group/settings',
  'gcash.rejected': 'group/settings',
  'membership.role_changed': '',
  'direct_message': 'messages',

  // oversight
  'audit.flagged': 'audit/flags',
  'audit.flag_closed': 'audit/flags',
  'audit.finding': 'audit/findings',
  'audit.proof_requested': 'proofs',
};

export function routeForNotification(n: NotificationTarget): Route | null {
  if (n.type.startsWith('identity.')) return { pathname: '/(app)/my-submission' };
  if (n.type.startsWith('profile_update.')) return { pathname: '/(app)/my-update-requests' };
  // Not a member of that group, so its screens aren't reachable.
  if (n.type === 'membership.rejected') return { pathname: '/(app)/groups' };

  if (!n.group_id) return null;
  const groupId = n.group_id;

  const senderId = n.data?.sender_id;
  if (n.type === 'direct_message' && typeof senderId === 'string') {
    return { pathname: '/(app)/[groupId]/dm/[memberId]', params: { groupId, memberId: senderId } };
  }

  const screen = GROUP_SCREEN[n.type];
  if (screen === undefined) return null;
  return {
    pathname: screen ? `/(app)/[groupId]/${screen}` : '/(app)/[groupId]',
    params: { groupId },
  };
}
