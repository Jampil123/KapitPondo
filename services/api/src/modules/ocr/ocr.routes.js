// services/api/src/modules/ocr/ocr.routes.js
// KapitPondo — plain OCR text extraction (Google Cloud Vision). See
// integrations/ocr/googleVision.js for the actual API call and the hard
// rule it's built around: this only reads text out of an image, it never
// verifies or posts anything — any field a caller pulls out of the result
// is a draft the member/officer still reviews before submitting.
//
// Not scoped to a group (unlike ai.routes.js's structure-proof endpoint) —
// reading text out of a photo doesn't touch any group's data, so any
// authenticated member can call it.
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { extractText } = require('../../integrations/ocr/googleVision');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// ~8MB source image, base64-encoded (~1.37x larger) — same budget as
// ai.routes.js's proof-photo endpoint, well under app.js's 10mb json limit.
const MAX_IMAGE_BASE64_LEN = 8 * 1024 * 1024 * 1.4;

function requireVisionConfigured(req, res, next) {
  if (!process.env.GOOGLE_VISION_API_KEY) {
    return res.status(501).json({ error: 'OCR is not configured yet — set GOOGLE_VISION_API_KEY.' });
  }
  next();
}

// POST /api/ocr/extract-text  { image_base64, media_type }
// Reads an image (receipt, ID card, form) and returns the raw text Vision
// recognized in it. Purely advisory — the caller decides what to do with
// the text; nothing here writes to the database.
router.post('/ocr/extract-text', requireAuth, requireVisionConfigured, async (req, res, next) => {
  try {
    const { image_base64, media_type } = req.body;
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'image_base64 is required' });
    }
    if (image_base64.length > MAX_IMAGE_BASE64_LEN) {
      return res.status(400).json({ error: 'Image is too large' });
    }
    if (!ALLOWED_IMAGE_TYPES.includes(media_type)) {
      return res.status(400).json({ error: `media_type must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}` });
    }
    const result = await extractText({ imageBase64: image_base64 });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
