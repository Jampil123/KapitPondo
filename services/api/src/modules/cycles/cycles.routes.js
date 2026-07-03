const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./cycles.service');

// Create a cycle (owner or treasurer)
router.post('/groups/:groupId/cycles', requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const { name, contribution_amount, start_date } = req.body;
      if (!name || contribution_amount == null || !start_date) {
        return res.status(400).json({ error: 'name, contribution_amount and start_date are required' });
      }
      const cycle = await service.createCycle({
        groupId: req.params.groupId,
        name,
        contributionAmount: contribution_amount,
        frequency: req.body.frequency,
        penaltyAmount: req.body.penalty_amount,
        penaltyType: req.body.penalty_type,
        startDate: start_date,
        endDate: req.body.end_date,
      });
      res.status(201).json({ cycle });
    } catch (err) { next(err); }
  }
);

// List cycles (any member)
router.get('/groups/:groupId/cycles', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const cycles = await service.listCycles(req.params.groupId);
      res.json({ cycles });
    } catch (err) { next(err); }
  }
);

// Activate a cycle (owner or treasurer)
router.post('/groups/:groupId/cycles/:id/activate', requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const cycle = await service.activateCycle(req.params.id);
      res.json({ message: 'Cycle activated', cycle });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'This group already has an active cycle' });
      }
      next(err);
    }
  }
);

// Close a cycle (owner or treasurer)
router.post('/groups/:groupId/cycles/:id/close', requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const cycle = await service.closeCycle(req.params.id);
      res.json({ message: 'Cycle closed', cycle });
    } catch (err) { next(err); }
  }
);

// Expected vs collected contributions for a cycle (any member)
router.get('/groups/:groupId/cycles/:id/progress', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const progress = await service.cycleProgress(req.params.id);
      res.json({ progress });
    } catch (err) { next(err); }
  }
);

module.exports = router;