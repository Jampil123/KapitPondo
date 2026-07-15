const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const service = require('./identity.service');

// --- Member-facing ---

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
      id_document_url, full_name, phone, id_type, selfie_url, email,
      first_name, middle_name, last_name, birthday,
      nationality, region, province, city, barangay, street_address, zip_code,
      source_of_funds, employment_status, occupation,
    } = req.body;
    if (!id_document_url) {
      return res.status(400).json({ error: 'id_document_url is required' });
    }
    const member = await service.submitDocument({
      memberId: req.member.id,
      idDocumentUrl: id_document_url,
      fullName: full_name,
      phone,
      idType: id_type,
      selfieUrl: selfie_url,
      email,
      firstName: first_name,
      middleName: middle_name,
      lastName: last_name,
      birthday,
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