/**
 * services/api/src/modules/systemConfig/systemConfig.routes.js
 * System Configuration (migration 0066).
 *   /admin/system-config/*        — System Administrator only
 *   /system/config, /announcements — signed-in members (what the app reads)
 *   /system/policies/:kind        — public, so sign-up can show the Terms
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const { isMissingTable } = require('../../lib/systemConfig');
const service = require('./systemConfig.service');

const admin = [requireAuth, requireSystemAdmin];
const actor = (req) => ({ adminMemberId: req.member.id, actorAuthId: req.authUser.id });

// ValidationError → 400; a database without migration 0066 → 503 with a hint.
function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof service.ValidationError) return res.status(400).json({ error: err.message });
      if (isMissingTable(err) || /system_(announcements|policies)/.test(err?.message ?? '')) {
        return res.status(503).json({ error: 'System Configuration needs database migration 0066.' });
      }
      next(err);
    }
  };
}

// --- settings ---
router.get('/admin/system-config', ...admin, handle(async (req, res) => {
  res.json(await service.getConfig());
}));

router.put('/admin/system-config/:key', ...admin, handle(async (req, res) => {
  const value = await service.updateSetting(req.params.key, req.body?.value, actor(req));
  res.json({ value });
}));

// --- announcements ---
router.get('/admin/system-config/announcements', ...admin, handle(async (req, res) => {
  res.json({ announcements: await service.listAnnouncements() });
}));

router.post('/admin/system-config/announcements', ...admin, handle(async (req, res) => {
  res.status(201).json(await service.saveAnnouncement(null, req.body, actor(req)));
}));

router.patch('/admin/system-config/announcements/:id', ...admin, handle(async (req, res) => {
  const out = await service.saveAnnouncement(req.params.id, req.body, actor(req));
  if (!out) return res.status(404).json({ error: 'Announcement not found' });
  res.json(out);
}));

router.delete('/admin/system-config/announcements/:id', ...admin, handle(async (req, res) => {
  const out = await service.deleteAnnouncement(req.params.id, actor(req));
  if (!out) return res.status(404).json({ error: 'Announcement not found' });
  res.json({ message: 'Announcement deleted' });
}));

// --- policies ---
router.get('/admin/system-config/policies', ...admin, handle(async (req, res) => {
  res.json({ policies: await service.listPolicies() });
}));

router.post('/admin/system-config/policies', ...admin, handle(async (req, res) => {
  res.status(201).json({ policy: await service.createPolicy(req.body, actor(req)) });
}));

router.post('/admin/system-config/policies/:id/publish', ...admin, handle(async (req, res) => {
  const policy = await service.publishPolicy(req.params.id, actor(req));
  if (!policy) return res.status(409).json({ error: 'Already published, or not found' });
  res.json({ policy });
}));

router.delete('/admin/system-config/policies/:id', ...admin, handle(async (req, res) => {
  const policy = await service.deletePolicyDraft(req.params.id, actor(req));
  if (!policy) return res.status(409).json({ error: 'Only drafts can be deleted' });
  res.json({ message: 'Draft deleted' });
}));

// --- member app ---
router.get('/system/config', requireAuth, handle(async (req, res) => {
  res.json(await service.publicConfig());
}));

router.get('/system/announcements', requireAuth, async (req, res, next) => {
  try {
    res.json({ announcements: await service.liveAnnouncements(req.member.id) });
  } catch (err) {
    // Before migration 0066 there are simply no announcements.
    if (isMissingTable(err) || /system_announcements/.test(err?.message ?? '')) return res.json({ announcements: [] });
    next(err);
  }
});

router.get('/system/policies/:kind', async (req, res, next) => {
  try {
    const policy = await service.currentPolicy(req.params.kind);
    if (!policy) return res.status(404).json({ error: 'No published policy' });
    res.json({ policy });
  } catch (err) {
    if (isMissingTable(err) || /system_policies/.test(err?.message ?? '')) return res.status(404).json({ error: 'No published policy' });
    next(err);
  }
});

module.exports = router;
