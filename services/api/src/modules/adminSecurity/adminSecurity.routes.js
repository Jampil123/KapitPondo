/**
 * services/api/src/modules/adminSecurity/adminSecurity.routes.js
 * Lets a signed-in system admin view (question text only, never answers) and
 * set their own recovery-question answers, from the Settings page.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const supabaseAdmin = require('../../config/supabase');
const { hashAnswer } = require('../../lib/passwordHash');

router.get('/admin/security-questions', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_security_questions')
      .select('question_1, question_2, updated_at')
      .eq('member_id', req.member.id)
      .maybeSingle();
    if (error) throw error;
    res.json(data ?? { question_1: null, question_2: null, updated_at: null });
  } catch (err) { next(err); }
});

router.put('/admin/security-questions', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const { question_1, answer_1, question_2, answer_2 } = req.body || {};
    if (!question_1?.trim() || !answer_1?.trim() || !question_2?.trim() || !answer_2?.trim()) {
      return res.status(400).json({ error: 'Both questions and answers are required.' });
    }
    if (question_1.trim().toLowerCase() === question_2.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Choose two different questions.' });
    }

    const { error } = await supabaseAdmin.from('admin_security_questions').upsert(
      {
        member_id: req.member.id,
        question_1: question_1.trim(),
        answer_1_hash: hashAnswer(answer_1),
        question_2: question_2.trim(),
        answer_2_hash: hashAnswer(answer_2),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id' }
    );
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
