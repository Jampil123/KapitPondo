// services/api/src/modules/payments/payments.service.js
// KapitPondo — PayMongo loan-repayment confirmation. Called only from
// payments.routes.js's webhook handler once a signed PayMongo event
// confirms a checkout payment succeeded. Still returns 501 (see
// payments.routes.js's requirePaymongoConfigured / webhook guard) until
// PAYMONGO_SECRET_KEY / PAYMONGO_WEBHOOK_SECRET are set in the environment
// — this must never fake a "payment confirmed" response just because the
// route exists.

const supabase = require('../../config/supabase');

// Called by the future webhook handler once a provider's SIGNED event
// confirms a payment actually succeeded. See migration 0038's
// auto_confirm_loan_repayment() for exactly what this posts (ledger credit
// + balance update, interest-first split — same math as the human-confirmed
// path, just with no human recorder/approver pair: the gateway's own
// confirmation stands in for both, which is why this must never be called
// from anything except a verified webhook).
async function autoConfirmRepayment({ loanId, amount, gatewayProvider, gatewayReference, gatewayStatus, gatewayPayload }) {
  const { data, error } = await supabase.rpc('auto_confirm_loan_repayment', {
    p_loan_id: loanId,
    p_amount: amount,
    p_gateway_provider: gatewayProvider,
    p_gateway_reference: gatewayReference,
    p_gateway_status: gatewayStatus || 'paid',
    p_gateway_payload: gatewayPayload || null,
  });
  if (error) throw error;
  return data;
}

module.exports = { autoConfirmRepayment };
