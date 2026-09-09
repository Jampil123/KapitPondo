/**
 * services/api/src/integrations/ocr/googleVision.js
 * Google Cloud Vision API client (REST, API-key auth via GOOGLE_VISION_API_KEY)
 * for plain text extraction from an image — e.g. reading a payment receipt or
 * an ID document before a member (or officer) types the fields in by hand.
 *
 * This module only reads text out of an image. It never decides what the
 * text means, never verifies anything, and never writes to the database —
 * same hard rule as integrations/ai/gemini.js: any field this feeds into a
 * form is a draft the member/officer still reviews before submitting, and
 * the normal submit -> confirm flow (a DIFFERENT officer) still applies.
 */
const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

function apiKey() {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    throw Object.assign(new Error('GOOGLE_VISION_API_KEY is not configured'), { status: 501 });
  }
  return key;
}

// Vision wants raw base64 image bytes — strip a data: URI prefix if the
// caller sent one (e.g. "data:image/jpeg;base64,...").
function stripDataUriPrefix(imageBase64) {
  const commaIndex = imageBase64.indexOf(',');
  return imageBase64.startsWith('data:') && commaIndex !== -1
    ? imageBase64.slice(commaIndex + 1)
    : imageBase64;
}

/**
 * Reads an image and returns the full text Vision recognized in it, plus
 * per-block text with Vision's own confidence score. Uses
 * DOCUMENT_TEXT_DETECTION — Vision's dense-text mode, better suited to
 * receipts/ID cards/forms than TEXT_DETECTION's sparse-text mode.
 */
async function extractText({ imageBase64 }) {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw Object.assign(new Error('imageBase64 is required'), { status: 400 });
  }

  const res = await fetch(`${VISION_ENDPOINT}?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: stripDataUriPrefix(imageBase64) },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`Vision API request failed (${res.status})`), { status: 502, detail: body });
  }

  const data = await res.json();
  const result = data?.responses?.[0];
  if (result?.error) {
    throw Object.assign(new Error(result.error.message || 'Vision API returned an error'), { status: 502 });
  }

  const fullText = result?.fullTextAnnotation?.text ?? '';
  const blocks = (result?.fullTextAnnotation?.pages ?? []).flatMap((page) =>
    (page.blocks ?? []).map((block) => ({
      text: (block.paragraphs ?? [])
        .flatMap((p) => (p.words ?? []).map((w) => (w.symbols ?? []).map((s) => s.text).join('')))
        .join(' '),
      confidence: block.confidence ?? null,
    }))
  );

  return { text: fullText, blocks };
}

module.exports = { extractText };
