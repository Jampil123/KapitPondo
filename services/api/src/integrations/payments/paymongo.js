/**
 * services/api/src/integrations/payments/paymongo.js
 * Thin PayMongo API client: create a Checkout Session (outbound) and verify
 * a webhook's signature (inbound). Whether this hits PayMongo's test or live
 * environment is decided purely by which key is in PAYMONGO_SECRET_KEY
 * (sk_test_... vs sk_live_...) — the API itself is identical either way.
 */
const crypto = require('crypto');

const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

function authHeader() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error('PAYMONGO_SECRET_KEY is not configured'), { status: 501 });
  }
  // PayMongo uses HTTP Basic auth with the secret key as the username and
  // an empty password — there is no "password" concept on their side.
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

async function paymongoRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${PAYMONGO_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.errors?.[0]?.detail || `PayMongo request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status, details: json });
  }
  return json;
}

/**
 * Creates a Checkout Session for one line item. `amount` is in PESOS —
 * PayMongo's API is centavo-denominated, so it's converted here to keep
 * every caller working in the same units as the rest of the app.
 * `metadata` rides along on the session and comes back untouched inside the
 * webhook event — that's how the webhook knows what this payment was for
 * (see payments.routes.js's webhook handler reading metadata.kind).
 */
async function createCheckoutSession({ amount, description, metadata, successUrl, cancelUrl }) {
  const centavos = Math.round(Number(amount) * 100);
  const json = await paymongoRequest('/checkout_sessions', {
    method: 'POST',
    body: {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          line_items: [{ amount: centavos, currency: 'PHP', name: description, quantity: 1 }],
          payment_method_types: ['gcash', 'paymaya', 'card'],
          description,
          metadata,
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      },
    },
  });
  return { id: json.data.id, checkoutUrl: json.data.attributes.checkout_url };
}

/**
 * PayMongo signs webhooks with a `Paymongo-Signature` header shaped
 * "t=<unix ts>,te=<test-mode hmac>,li=<live-mode hmac>". The hmac is
 * HMAC-SHA256 of `${t}.${rawBody}` keyed with the webhook's own signing
 * secret (from the PayMongo dashboard, NOT the API secret key) — te/li just
 * say which mode produced the event, so only one needs to match depending
 * on whether PAYMONGO_SECRET_KEY is a test or live key.
 *
 * `rawBody` must be the exact bytes PayMongo sent — re-serializing the
 * parsed JSON produces a different byte string and the signature will never
 * match (see app.js's express.json({ verify }) which captures this).
 */
function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret, { live = false } = {}) {
  if (!signatureHeader || !webhookSecret || !rawBody) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k, v];
    }),
  );
  const timestamp = parts.t;
  const providedSignature = live ? parts.li : parts.te;
  if (!timestamp || !providedSignature) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(providedSignature, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { createCheckoutSession, verifyWebhookSignature };
