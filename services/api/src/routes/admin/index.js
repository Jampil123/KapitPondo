/**
 * services/api/src/routes/admin/index.js
 * Mounts every /admin route behind requireSysadmin. Wire into your server:
 *
 *   const adminRouter = require('./src/routes/admin');
 *   app.use('/admin', adminRouter);
 */
const { Router } = require('express');
const { requireSysadmin } = require('../../middleware/requireSysadmin');
const verifications = require('./verifications');
const metrics = require('./metrics');
const audit = require('./audit');

const router = Router();

// Every admin endpoint requires an active platform admin.
router.use(requireSysadmin);

// GET /admin/me — who am I? (the admin app's auth guard calls this)
router.get('/me', (req, res) => {
  res.json(req.admin);
});

router.use('/metrics', metrics);
router.use('/verifications', verifications);
router.use('/audit', audit);

module.exports = router;