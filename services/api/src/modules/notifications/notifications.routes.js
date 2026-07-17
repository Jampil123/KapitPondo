// services/api/src/modules/notifications/notifications.routes.js
// KapitPondo — Notification Center (cross-cutting). Every module writes here
// via lib/notifications.js; this module is the read side the app polls.
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const service = require('./notifications.service');

// List my notifications, newest first.
router.get('/me/notifications', requireAuth, async (req, res, next) => {
  try {
    const notifications = await service.listMyNotifications({
      memberId: req.member.id,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      unreadOnly: req.query.unread === 'true',
    });
    res.json({ notifications });
  } catch (err) { next(err); }
});

// Mark one notification read (only if it belongs to me).
router.post('/me/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    const notification = await service.markRead({ id: req.params.id, memberId: req.member.id });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification });
  } catch (err) { next(err); }
});

// Mark all of my notifications read.
router.post('/me/notifications/read-all', requireAuth, async (req, res, next) => {
  try {
    await service.markAllRead(req.member.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Register this device's Expo push token (called on sign-in / app start).
router.post('/me/push-token', requireAuth, async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    await service.registerPushToken({ memberId: req.member.id, token, platform });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Unregister a device's token (called on sign-out).
router.delete('/me/push-token', requireAuth, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    await service.unregisterPushToken(token);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
