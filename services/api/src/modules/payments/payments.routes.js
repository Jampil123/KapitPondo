// services/api/src/modules/payments/payments.routes.js
// KapitPondo — PayMongo checkout (loan repayments + contributions) and the
// webhook that confirms them. See services/api/src/integrations/payments/
// paymongo.js for the actual API client + signature verification.
//
// Flow:
//   1. Member taps "Pay online" on loans/repay.tsx or contributions/contribute.tsx.
//   2. Backend creates a PayMongo Checkout Session with metadata identifying
//      what the payment is for, returns the checkout URL for the app to open.
//   3. Member completes payment on PayMongo's hosted checkout (GCash, Maya,
//      card — whichever rail they pick; KapitPondo doesn't touch that part).
//   4. PayMongo POSTs a SIGNED webhook event here. The signature is verified
//      against PAYMONGO_WEBHOOK_SECRET before anything in the payload is
//      trusted — this endpoint is public, so that check is non-negotiable.
//      No screenshot, no reference-number typing — the webhook itself IS
//      the proof (harder to fake than a photo, and it already carries the
//      reference number that used to have to be typed in by hand).
//
// Both checkout + webhook return 501 until PAYMONGO_SECRET_KEY /
// PAYMONGO_WEBHOOK_SECRET actually exist in the environment — this must
// never fake a "payment confirmed" response just because the route exists.
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const supabase = require('../../config/supabase');
const paymongo = require('../../integrations/payments/paymongo');
const lendingService = require('../lending/lending.service');
const contributionsService = require('../contributions/contributions.service');
const service = require('./payments.service');

// expo.json's "scheme" — the checkout session redirects here after payment;
// the app doesn't actually need to read anything off this URL (the webhook
// is what confirms the payment), it just closes the in-app browser.
const APP_SCHEME = 'kapitpondo';

function requirePaymongoConfigured(req, res, next) {
  if (!process.env.PAYMONGO_SECRET_KEY) {
    return res.status(501).json({ error: 'PayMongo integration is not configured yet — set PAYMONGO_SECRET_KEY.' });
  }
  next();
}

// POST /api/groups/:groupId/loans/:id/repayments/checkout  { amount }
router.post(
  '/groups/:groupId/loans/:id/repayments/checkout',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  requirePaymongoConfigured,
  async (req, res, next) => {
    try {
      const { amount } = req.body;
      if (amount == null || Number(amount) <= 0) {
        return res.status(400).json({ error: 'amount must be greater than zero' });
      }

      const loan = await lendingService.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      if (loan.membership_id !== req.membership.id) {
        return res.status(403).json({ error: 'You can only pay off your own loan' });
      }

      const session = await paymongo.createCheckoutSession({
        amount,
        description: 'Loan repayment',
        metadata: {
          kind: 'loan_repayment',
          loan_id: loan.id,
          membership_id: req.membership.id,
          group_id: req.params.groupId,
        },
        // Expo Router's `(app)` route group doesn't appear in the URL, and
        // there's no loans/[id] screen (yet) — land on the loans list,
        // which does exist and will show the now-approved repayment.
        successUrl: `${APP_SCHEME}://${req.params.groupId}/loans?checkout=success`,
        cancelUrl: `${APP_SCHEME}://${req.params.groupId}/loans?checkout=cancelled`,
      });

      res.json({ checkout_url: session.checkoutUrl });
    } catch (err) { next(err); }
  }
);

// POST /api/groups/:groupId/cycles/:cycleId/contributions/checkout  { amount }
router.post(
  '/groups/:groupId/cycles/:cycleId/contributions/checkout',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  requirePaymongoConfigured,
  async (req, res, next) => {
    try {
      const { amount } = req.body;
      if (amount == null || Number(amount) <= 0) {
        return res.status(400).json({ error: 'amount must be greater than zero' });
      }

      const { data: cycle, error: cycleErr } = await supabase
        .from('cycles').select('group_id').eq('id', req.params.cycleId).maybeSingle();
      if (cycleErr) throw cycleErr;
      if (!cycle || cycle.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Cycle does not belong to this group' });
      }

      const session = await paymongo.createCheckoutSession({
        amount,
        description: 'Contribution',
        metadata: {
          kind: 'contribution',
          membership_id: req.membership.id,
          cycle_id: req.params.cycleId,
          group_id: req.params.groupId,
        },
        // Lands back on the SAME contribute screen (not just the list) —
        // on Android, openAuthSessionAsync's redirect is a real deep link
        // that Expo Router navigates to, remounting this screen fresh. It
        // reads `checkout` off the URL to resume the processing/done UI
        // instead of just dumping the member on the list.
        successUrl: `${APP_SCHEME}://${req.params.groupId}/contributions/contribute?checkout=success`,
        cancelUrl: `${APP_SCHEME}://${req.params.groupId}/contributions/contribute?checkout=cancelled`,
      });

      res.json({ checkout_url: session.checkoutUrl });
    } catch (err) { next(err); }
  }
);

// POST /api/webhooks/paymongo — PUBLIC, signature-verified (no requireAuth:
// this is called by PayMongo's servers, not a logged-in member). Reads
// req.rawBody (see app.js's express.json({ verify }) config) since the HMAC
// must be computed over PayMongo's exact bytes, not the re-serialized body.
router.post('/webhooks/paymongo', async (req, res) => {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(501).json({
      error: 'PayMongo integration is not configured yet — this endpoint is a planned scaffold, not live.',
    });
  }

  const signature = req.headers['paymongo-signature'];
  if (!paymongo.verifyWebhookSignature(req.rawBody, signature, secret)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const event = req.body;
    const eventType = event?.data?.attributes?.type;
    const payment = event?.data?.attributes?.data;
    const metadata = payment?.attributes?.metadata;

    // Only a completed payment triggers a ledger post — every other event
    // type (payment.failed, refund.*, etc.) is just acknowledged so
    // PayMongo stops retrying it. PayMongo's real event name is
    // "payment.paid" (there is no "checkout_session.payment.paid" — a
    // Checkout Session's underlying Payment inherits the session's
    // metadata and fires this same event once it clears).
    if (eventType !== 'payment.paid' || !metadata?.kind) {
      return res.status(200).json({ received: true });
    }

    const amountPesos = Number(payment.attributes.amount) / 100;
    const gatewayReference = payment.id;

    if (metadata.kind === 'loan_repayment') {
      await service.autoConfirmRepayment({
        loanId: metadata.loan_id,
        amount: amountPesos,
        gatewayProvider: 'paymongo',
        gatewayReference,
        gatewayStatus: eventType,
        gatewayPayload: event,
      });
    } else if (metadata.kind === 'contribution') {
      await contributionsService.autoConfirmContribution({
        membershipId: metadata.membership_id,
        cycleId: metadata.cycle_id,
        groupId: metadata.group_id,
        amount: amountPesos,
        gatewayProvider: 'paymongo',
        gatewayReference,
        gatewayStatus: eventType,
        gatewayPayload: event,
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    // 500 (not 200) so PayMongo retries — swallowing a failed ledger post
    // here would silently lose a real payment.
    console.error('[paymongo webhook] processing failed:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
