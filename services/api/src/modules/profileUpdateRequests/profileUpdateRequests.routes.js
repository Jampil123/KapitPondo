const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const service = require('./profileUpdateRequests.service');

// POST /me/profile-update-requests — the only way to change a locked field
// once verified (see the guard on PATCH /me/profile in identity.routes.js).
router.post('/me/profile-update-requests', requireAuth, async (req, res, next) => {
  try {
    const { field, current_value, new_value, reason, details, proof_url } = req.body;
    const request = await service.submitRequest({
      memberId: req.member.id,
      field,
      currentValue: current_value,
      newValue: new_value,
      reason,
      details,
      proofUrl: proof_url,
    });
    res.status(201).json({ request });
  } catch (err) { next(err); }
});

router.get('/me/profile-update-requests', requireAuth, async (req, res, next) => {
  try {
    const requests = await service.listMyRequests(req.member.id);
    res.json({ requests });
  } catch (err) { next(err); }
});

module.exports = router;
