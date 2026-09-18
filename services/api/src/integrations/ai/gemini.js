/**
 * services/api/src/integrations/ai/gemini.js
 * Gemini API client (Google's Interactions API) for two member-facing AI
 * features:
 *
 *   - structureProofImage: reads a payment-proof photo (GCash/Maya/bank
 *     screenshot, cash slip) and extracts the fields a member would
 *     otherwise type by hand — amount, reference number, date, method. This
 *     is a DRAFT to pre-fill the manual payment form faster; the member
 *     still reviews it before submitting, and a DIFFERENT officer still
 *     confirms it before anything posts (same submit -> confirm flow as
 *     every other contribution/repayment — see contributions.service.js /
 *     lending.service.js). The AI never posts anything itself.
 *
 *   - structureIdImage: same idea, for a government ID photo in the identity
 *     verification wizard.
 *
 * HARD RULE (per the project's own design note): the AI never computes or
 * verifies money, and never writes anything. Every peso calculation and
 * every write in this app happens in system code (the approve_contribution /
 * auto_confirm_* / record_walkin_* SQL functions, the normal submit/approve
 * routes) — these two functions only read, extract, and draft.
 */
const { GoogleGenAI } = require('@google/genai');

const VISION_MODEL = 'gemini-3.8-flash';

function client() {
  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { status: 501 });
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const PROOF_SCHEMA = {
  type: 'object',
  properties: {
    amount: { type: ['number', 'null'] },
    reference_number: { type: ['string', 'null'] },
    // ISO 8601 date (YYYY-MM-DD) if legible, else null.
    date: { type: ['string', 'null'] },
    payment_method: { type: ['string', 'null'], enum: ['gcash', 'maya', 'bank_transfer', 'cash', 'other', null] },
    // The recipient's mobile number/account shown on the receipt (e.g. GCash's
    // "Sent to" field), if printed — lets the caller flag a payment sent to
    // the wrong number. Not every receipt shows this, so null is common.
    recipient_number: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    // e.g. "amount partially covered by a finger" — shown to the member so
    // they know what to double-check before submitting.
    notes: { type: ['string', 'null'] },
  },
  required: ['amount', 'reference_number', 'date', 'payment_method', 'recipient_number', 'confidence', 'notes'],
};

const STRUCTURE_PROMPT = `You read Philippine payment receipts and proof-of-payment screenshots (GCash, Maya, bank transfer, cash deposit slips) and extract exactly what's printed on them.

Rules:
- Report only what is actually visible in the image. Never guess, round, or infer a value that isn't legible — return null for anything you can't read clearly, and say why in "notes".
- You are not verifying, approving, or recording this payment. A human still reviews every field before submitting, and a different officer still confirms it afterward. Your output is only a draft to save typing.
- "amount" is the peso amount printed on the receipt, as a plain number (no currency symbol, no thousands separators).
- "date" is the transaction date printed on the receipt in YYYY-MM-DD form, or null if not legible — never today's date, never a guess.
- "recipient_number" is the recipient's mobile number or account shown on the receipt (e.g. GCash's "Sent to" field), exactly as printed — null if the receipt doesn't show one.

Extract the payment details from the attached image.`;

/**
 * Reads a not-yet-uploaded proof-of-payment image and returns suggested
 * form field values. Purely advisory — never writes to the database itself;
 * the caller still goes through the normal submit endpoint.
 */
async function structureProofImage({ imageBase64, mediaType }) {
  const interaction = await client().interactions.create({
    model: VISION_MODEL,
    input: [
      { type: 'text', text: STRUCTURE_PROMPT },
      { type: 'image', data: imageBase64, mime_type: mediaType },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: PROOF_SCHEMA,
    },
  });

  let parsed;
  try {
    parsed = JSON.parse(interaction.output_text);
  } catch {
    throw Object.assign(new Error('Could not read this image — try a clearer photo.'), { status: 422 });
  }
  return parsed;
}

const ID_FIELDS_SCHEMA = {
  type: 'object',
  properties: {
    first_name: { type: ['string', 'null'] },
    middle_name: { type: ['string', 'null'] },
    last_name: { type: ['string', 'null'] },
    // ISO 8601 date (YYYY-MM-DD) if legible, else null.
    birthday: { type: ['string', 'null'] },
    sex: { type: ['string', 'null'], enum: ['male', 'female', null] },
    id_number: { type: ['string', 'null'] },
    nationality: { type: ['string', 'null'] },
    province: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] },
    barangay: { type: ['string', 'null'] },
    street_address: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    // e.g. "middle name not printed on this ID type" — shown to the member
    // so they know what to double-check/fill in themselves.
    notes: { type: ['string', 'null'] },
  },
  required: [
    'first_name', 'middle_name', 'last_name', 'birthday', 'sex', 'id_number', 'nationality',
    'province', 'city', 'barangay', 'street_address', 'confidence', 'notes',
  ],
};

const ID_STRUCTURE_PROMPT = `You read Philippine government-issued ID cards (PhilSys National ID, driver's license, passport, UMID, PRC ID, voter's ID, postal ID, SSS ID, GSIS eCard) and extract exactly what's printed on them, to save a member from retyping their own details into a form.

Rules:
- Report only what is actually printed/visible on the ID. Never guess, invent, or infer a value that isn't legible or isn't printed at all — return null for it, and say why in "notes" if it's worth flagging (e.g. "no middle name printed on this ID type").
- Filipino IDs commonly print the name as "Last Name, First Name, Middle Name" — split it into first_name/middle_name/last_name correctly rather than copying the printed order.
- "birthday" is in YYYY-MM-DD form, or null if not legible — never a guess.
- "sex" is "male" or "female" exactly as printed (M/F expands to that), or null if not printed on this ID type.
- "id_number" is the ID's own printed number/serial (e.g. the PhilSys number, license number, passport number) — whatever number uniquely identifies this specific document, not a barcode/QR payload.
- Split the printed address into province/city/barangay/street_address as best you can tell from how it's written; leave a part null if it isn't distinguishable in the text. Do not include a region or zip code even if printed — this schema has no field for either.
- You are not verifying this person's identity or the ID's authenticity — a human reviews and can edit every field before it's submitted. Your output is only a draft to save typing.

Extract the personal details from the attached ID photo.`;

/**
 * Reads a not-yet-uploaded ID photo (the front of the ID captured in the
 * identity wizard) and returns suggested personal-info form values. Purely
 * advisory, same rule as structureProofImage — this never verifies identity
 * or writes to the database; the member still reviews every field before
 * the normal /me/identity submit endpoint is called.
 */
async function structureIdImage({ imageBase64, mediaType }) {
  const interaction = await client().interactions.create({
    model: VISION_MODEL,
    input: [
      { type: 'text', text: ID_STRUCTURE_PROMPT },
      { type: 'image', data: imageBase64, mime_type: mediaType },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: ID_FIELDS_SCHEMA,
    },
  });

  let parsed;
  try {
    parsed = JSON.parse(interaction.output_text);
  } catch {
    throw Object.assign(new Error('Could not read this ID photo — try a clearer photo.'), { status: 422 });
  }
  return parsed;
}

module.exports = { structureProofImage, structureIdImage };
