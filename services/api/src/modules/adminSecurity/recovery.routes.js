/**
 * services/api/src/modules/adminSecurity/recovery.routes.js
 * Public (unauthenticated) password recovery for system admins, via security
 * questions instead of an email link — the static admin account has no real
 * inbox. On a correct answer pair, sets the new password directly through
 * the service-role client; no token/email round-trip needed.
 *
 * In-memory attempt limiter: fine for this single-instance deployment, but
 * would need a shared store (Redis, DB) behind multiple server instances.
 */
const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../../config/supabase');
const { verifyAnswer } = require('../../lib/passwordHash');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

function isLocked(key) {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    rec.count += 1;
  }
}

async function findAdminMember(email) {
  const { data, error } = await supabaseAdmin
    .from('members')
    .select('id, auth_id, email, is_system_admin')
    .eq('email', email)
    .eq('is_system_admin', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

router.get('/admin/recover/questions', async (req, res, next) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (isLocked(email)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });

    const member = await findAdminMember(email);
    const qs = member
      ? (
          await supabaseAdmin
            .from('admin_security_questions')
            .select('question_1, question_2')
            .eq('member_id', member.id)
            .maybeSingle()
        ).data
      : null;

    if (!qs) {
      recordFailure(email);
      return res.status(404).json({ error: 'No recovery questions are set up for this account.' });
    }
    res.json({ question_1: qs.question_1, question_2: qs.question_2 });
  } catch (err) { next(err); }
});

router.post('/admin/recover/reset', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const { answer_1, answer_2, new_password } = req.body || {};
    if (!email || !answer_1 || !answer_2 || !new_password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (isLocked(email)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });

    const member = await findAdminMember(email);
    const qs = member
      ? (
          await supabaseAdmin
            .from('admin_security_questions')
            .select('answer_1_hash, answer_2_hash')
            .eq('member_id', member.id)
            .maybeSingle()
        ).data
      : null;

    const ok = !!qs && verifyAnswer(answer_1, qs.answer_1_hash) && verifyAnswer(answer_2, qs.answer_2_hash);
    if (!ok) {
      recordFailure(email);
      return res.status(401).json({ error: 'One or more answers are incorrect.' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(member.auth_id, { password: new_password });
    if (error) throw error;

    attempts.delete(email);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
