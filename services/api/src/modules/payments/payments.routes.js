// services/api/src/modules/payments/payments.routes.js
// KapitPondo — payment gateway webhook (FUTURE PLAN, not live yet).
//
// PLANNED SHAPE for when a real provider (PayMongo, per `payment_method`'s
// existing 'paymongo' value) is actually configured:
//   1. Member taps "Pay with GCash" on loans/repay.tsx.
//   2. Backend creates a PayMongo Checkout Session for the loan's amount,
//      with metadata { loan_id, membership_id } attached, and returns the
//      checkout URL for the app to open (a new POST /groups/:groupId/
//      loans/:id/repayments/checkout endpoint, not built yet — no reason to
//      scaffold the outbound half until the inbound webhook below is real).
//   3. Member completes payment on PayMongo's hosted checkout (GCash, Maya,
//      card — whichever rail they pick; KapitPondo doesn't touch that part).
//   4. PayMongo POSTs a SIGNED webhook event here. The real handler must:
//        - verify the `Paymongo-Signature` header against
//          process.env.PAYMONGO_WEBHOOK_SECRET (reject anything unsigned —
//          this endpoint being public is exactly why that check is
//          non-negotiable before ever calling autoConfirmRepayment)
//        - read event.data.attributes.data.attributes.metadata.loan_id
//        - call service.autoConfirmRepayment({ loanId, amount,
//          gatewayProvider: 'paymongo', gatewayReference: event.data.id,
//          gatewayStatus: event.data.attributes.type, gatewayPayload: event })
//      No screenshot, no reference-number typing — the webhook itself IS
//      the proof (harder to fake than a photo, and it already carries the
//      reference number that used to have to be typed in by hand).
//
// Returns 501 until PAYMONGO_SECRET_KEY / PAYMONGO_WEBHOOK_SECRET actually
// exist in the environment — this must never fake a "payment confirmed"
// response just because the route exists.
const express = require('express');
const router = express.Router();

router.post('/webhooks/paymongo', async (req, res) => {
  res.status(501).json({
    error: 'PayMongo integration is not configured yet — this endpoint is a planned scaffold, not live.',
  });
});

module.exports = router;
