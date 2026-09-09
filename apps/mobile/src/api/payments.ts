/**
 * api/payments.ts
 * ----------------------------------------------------------------------------
 * PayMongo checkout — creates a hosted Checkout Session and returns its URL.
 * The app opens that URL; confirmation happens server-side via a signed
 * webhook (see services/api/src/modules/payments/payments.routes.js), not a
 * response from this call — the contribution/loan payment shows up as
 * 'approved' + auto_confirmed once the webhook lands, picked up by the
 * screen's normal realtime-watched list query.
 */
import { api } from './client';

export function createContributionCheckout(groupId: string, cycleId: string, amount: number) {
  return api.post<{ checkout_url: string }>(
    `/api/groups/${groupId}/cycles/${cycleId}/contributions/checkout`,
    { amount },
  );
}

export function createLoanRepaymentCheckout(groupId: string, loanId: string, amount: number) {
  return api.post<{ checkout_url: string }>(
    `/api/groups/${groupId}/loans/${loanId}/repayments/checkout`,
    { amount },
  );
}
