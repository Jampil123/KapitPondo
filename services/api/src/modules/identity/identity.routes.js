const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const service = require('./identity.service');
const { extractText } = require('../../integrations/ocr/googleVision');
const { parseIdFields } = require('../../integrations/ocr/idFieldParser');

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

// --- Member-facing ---

// POST /me/identity/extract-fields  { image_base64, media_type }
// Reads the ID photo captured in step 1 of the wizard and suggests personal-
// info field values for step 3 — a draft only, the member still reviews/
// edits every field before /me/identity is called; this never verifies
// identity. Not scoped to a group — this runs before the member necessarily
// belongs to any group.
//
// Uses plain OCR (Google Vision, same integration as /api/ocr/extract-text)
// plus idFieldParser.js's own label/pattern matching, NOT the Gemini-based
// structureIdImage in integrations/ai/gemini.js (kept in that file, unused
// here, in case this gets switched back) — Gemini's API quota was getting
// exhausted by normal use, and Vision's OCR quota is separate/more generous.
// The tradeoff: pattern-matching raw OCR text is less capable than an LLM at
// this (see idFieldParser.js's own header for specifics), so this will leave
// more fields null on ID layouts/photos it can't confidently parse.
router.post('/me/identity/extract-fields', requireAuth, requireVisionConfigured, async (req, res, next) => {
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
    const { text } = await extractText({ imageBase64: image_base64 });
    const fields = parseIdFields(text);
    res.json({ fields });
  } catch (err) { next(err); }
});

// View my own profile and verification status
router.get('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const member = await service.getMyProfile(req.member.id);
    res.json({ member });
  } catch (err) { next(err); }
});

// Update my own personal info (not the KYC document/selfie/status)
router.patch('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const {
      full_name, first_name, middle_name, last_name, email, birthday,
      nationality, region, province, city, barangay, street_address, zip_code,
      source_of_funds, employment_status, occupation, avatar_url,
    } = req.body;
    const member = await service.updateProfile({
      memberId: req.member.id,
      fullName: full_name,
      firstName: first_name,
      middleName: middle_name,
      lastName: last_name,
      email,
      birthday,
      avatarUrl: avatar_url,
      nationality,
      region,
      province,
      city,
      barangay,
      streetAddress: street_address,
      zipCode: zip_code,
      sourceOfFunds: source_of_funds,
      employmentStatus: employment_status,
      occupation,
    });
    res.json({ message: 'Profile updated', member });
  } catch (err) { next(err); }
});

// Submit / resubmit identity document
router.post('/me/identity', requireAuth, async (req, res, next) => {
  try {
    const {
      id_document_url, id_document_back_url, id_document_qr_data, full_name, phone, id_type, selfie_url, email,
      first_name, middle_name, last_name, birthday, sex, id_number,
      nationality, region, province, city, barangay, street_address, zip_code,
      source_of_funds, employment_status, occupation,
    } = req.body;
    if (!id_document_url) {
      return res.status(400).json({ error: 'id_document_url is required' });
    }
    const member = await service.submitDocument({
      memberId: req.member.id,
      idDocumentUrl: id_document_url,
      idDocumentBackUrl: id_document_back_url,
      idDocumentQrData: id_document_qr_data,
      fullName: full_name,
      phone,
      idType: id_type,
      selfieUrl: selfie_url,
      email,
      firstName: first_name,
      middleName: middle_name,
      lastName: last_name,
      birthday,
      sex,
      idNumber: id_number,
      nationality,
      region,
      province,
      city,
      barangay,
      streetAddress: street_address,
      zipCode: zip_code,
      sourceOfFunds: source_of_funds,
      employmentStatus: employment_status,
      occupation,
    });
    if (!member) {
      return res.status(409).json({ error: 'Cannot submit — already verified, or member not found' });
    }
    res.json({ message: 'Identity submitted for review', member });
  } catch (err) { next(err); }
});

// --- System Administrator only ---

// The verification queue (default: pending; pass ?status=verified|rejected to filter)
router.get('/admin/verifications', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const members = await service.listForReview(req.query.status || 'pending');
    res.json({ members });
  } catch (err) { next(err); }
});

// Inspect one member's full record
router.get('/admin/verifications/:id', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const member = await service.getMember(req.params.id, req.authUser.id);
    res.json({ member });
  } catch (err) { next(err); }
});

// Approve
router.post('/admin/verifications/:id/approve', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const member = await service.approveMember({
      memberId: req.params.id,
      reviewerId: req.member.id,
      actorAuthId: req.authUser.id,
    });
    if (!member) {
      return res.status(409).json({ error: 'Member is not pending verification' });
    }
    res.json({ message: 'Member verified', member });
  } catch (err) { next(err); }
});

// Reject
router.post('/admin/verifications/:id/reject', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const member = await service.rejectMember({
      memberId: req.params.id,
      actorAuthId: req.authUser.id,
      reason: req.body?.reason,
    });
    if (!member) {
      return res.status(409).json({ error: 'Member is not pending verification' });
    }
    res.json({ message: 'Member rejected', member });
  } catch (err) { next(err); }
});

module.exports = router;