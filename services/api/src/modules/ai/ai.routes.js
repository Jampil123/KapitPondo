// services/api/src/modules/ai/ai.routes.js
// KapitPondo — member-facing AI features: proof-photo field extraction and
// a support/FAQ chatbot. See integrations/ai/gemini.js for the actual
// Gemini calls and the hard rule both are built around: the AI never
// computes, verifies, or posts money — it only reads/structures/converses.
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const { structureProofImage, chatWithMember } = require('../../integrations/ai/gemini');
const reportingService = require('../reporting/reporting.service');
const cyclesService = require('../cycles/cycles.service');
const lendingService = require('../lending/lending.service');
const groupsService = require('../groups/groups.service');

// Every tool takes NO parameters — each is hardcoded to "the current
// caller's own data in the current group" (member/membership/groupId come
// from the authenticated request, never from the model). That's deliberate:
// with no parameter surface, there's nothing for the model to be tricked
// into asking for someone else's data.
const AI_TOOLS = [
  {
    type: 'function', name: 'get_my_profile',
    description: "Get the current member's own name, role, heads, and verification status in this group.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function', name: 'get_my_balance',
    description: "Get the current member's own contribution total and outstanding loan balance in this group.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function', name: 'get_my_loans',
    description: "List the current member's own loan requests/loans in this group, with status and amounts.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function', name: 'get_active_cycle',
    description: "Get this group's active contribution cycle: frequency, per-head contribution amount, penalty rule, start/end dates.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function', name: 'get_group_info',
    description: "Get this group's name, fund code, member count, and its officers.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function', name: 'get_group_fund_summary',
    description: "Get this group's overall fund totals: cash on hand, amount out on loan, total heads across all members.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

/** Builds the executor for AI_TOOLS, closed over the authenticated request's
 *  own member/membership/groupId — this is the only place identity enters. */
function makeAiToolExecutor({ groupId, member, membership }) {
  return async function executeTool(name) {
    switch (name) {
      case 'get_my_profile':
        return {
          full_name: member.full_name,
          role: membership.role,
          heads: membership.heads,
          joined_at: membership.joined_at,
          verification_status: member.verification_status,
        };
      case 'get_my_balance':
        return reportingService.myBalance(membership.id);
      case 'get_my_loans': {
        const loans = await lendingService.listLoans({ groupId, membershipId: membership.id, role: 'member' });
        return loans.map((l) => ({
          status: l.status, principal: l.principal,
          outstanding_balance: l.outstanding_balance, requested_at: l.created_at,
        }));
      }
      case 'get_active_cycle': {
        const cycles = await cyclesService.listCycles(groupId);
        const active = cycles.find((c) => c.status === 'active');
        if (!active) return { active: false };
        return {
          active: true, name: active.name, frequency: active.frequency,
          contribution_amount: active.contribution_amount,
          penalty_amount: active.penalty_amount, penalty_type: active.penalty_type,
          start_date: active.start_date, end_date: active.end_date,
        };
      }
      case 'get_group_info': {
        const [group, officersRes] = await Promise.all([
          groupsService.getGroup(groupId),
          groupsService.listOfficers(groupId),
        ]);
        return {
          name: group.name, fund_code: group.fund_code,
          member_count: officersRes.member_count,
          officers: officersRes.officers.map((o) => ({ role: o.role, full_name: o.full_name })),
        };
      }
      case 'get_group_fund_summary':
        return reportingService.fundSummary(groupId);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}

const ALL_ROLES = ['member', 'treasurer', 'auditor', 'owner'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// ~8MB source image, base64-encoded (~1.37x larger) — generous for a phone
// photo, small enough to stay well under Express's json body limit (app.js).
const MAX_IMAGE_BASE64_LEN = 8 * 1024 * 1024 * 1.4;
const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY_TURNS = 10;

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

// POST /api/groups/:groupId/ai/chat  { message, history?: [{role, content}] }
// A chatbot turn with real, read-only tool access to the CALLER's own data
// and their group's data (AI_TOOLS above) — see gemini.js's CHAT_SYSTEM for
// how it's instructed to use them, and makeAiToolExecutor for how every tool
// is scoped to req.member/req.membership, never to anything the model asks
// for. No server-side chat storage — the client resends recent turns as
// `history` each request.
router.post('/groups/:groupId/ai/chat', requireAuth,
  requireGroupRole(ALL_ROLES),
  requireGeminiConfigured,
  async (req, res, next) => {
    try {
      const { message, history } = req.body;
      const trimmed = typeof message === 'string' ? message.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ error: 'message is required' });
      }
      if (trimmed.length > MAX_MESSAGE_LEN) {
        return res.status(400).json({ error: `message must be ${MAX_MESSAGE_LEN} characters or fewer` });
      }
      const safeHistory = Array.isArray(history)
        ? history
          .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
          .slice(-MAX_HISTORY_TURNS)
        : [];
      const executeTool = makeAiToolExecutor({ groupId: req.params.groupId, member: req.member, membership: req.membership });
      const reply = await chatWithMember({ message: trimmed, history: safeHistory, tools: AI_TOOLS, executeTool });
      res.json({ reply });
    } catch (err) { next(err); }
  }
);

module.exports = router;
