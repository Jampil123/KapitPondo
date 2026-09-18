// services/api/src/modules/ai/ai.routes.js
// KapitPondo — member-facing AI feature: proof-photo field extraction. See
// integrations/ai/gemini.js for the actual Gemini call and the hard rule
// it's built around: the AI never computes, verifies, or posts money — it
// only reads and structures a draft.
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const { structureProofImage } = require('../../integrations/ai/gemini');

const ALL_ROLES = ['member', 'treasurer', 'auditor', 'owner'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// ~8MB source image, base64-encoded (~1.37x larger) — generous for a phone
// photo, small enough to stay well under Express's json body limit (app.js).
const MAX_IMAGE_BASE64_LEN = 8 * 1024 * 1024 * 1.4;

function requireGeminiConfigured(req, res, next) {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(501).json({ error: 'AI features are not configured yet — set GEMINI_API_KEY.' });
  }
  next();
}

// POST /api/groups/:groupId/ai/structure-proof  { image_base64, media_type }
// Reads a proof-of-payment photo BEFORE it's uploaded and suggests form
// values — a draft only. The member still reviews and submits through the
// normal contribute/repay flow, and an officer still confirms it before
// anything posts to the ledger.
router.post('/groups/:groupId/ai/structure-proof', requireAuth,
  requireGroupRole(ALL_ROLES),
  requireGeminiConfigured,
  async (req, res, next) => {
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
      const fields = await structureProofImage({ imageBase64: image_base64, mediaType: media_type });
      res.json({ fields });
    } catch (err) { next(err); }
  }
);

module.exports = router;
