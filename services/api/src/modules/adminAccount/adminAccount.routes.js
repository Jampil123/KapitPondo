/**
 * services/api/src/modules/adminAccount/adminAccount.routes.js
 * The signed-in system admin's own account, for the admin console's Settings:
 * profile (name, phone, photo), password change, and active sessions.
 * Login history reuses GET /me/login-activity (loginActivity.routes.js).
 */
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const supabase = require('../../config/supabase');
const env = require('../../config/env');

const PHOTO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const guard = [requireAuth, requireSystemAdmin];

function profileOf(member, authUser) {
  return {
    id: member.id,
    full_name: member.full_name,
    email: member.email ?? authUser.email ?? null,
    phone: member.phone,
    avatar_url: member.avatar_url,
    created_at: member.created_at,
    last_sign_in_at: authUser.last_sign_in_at ?? null,
  };
}

async function logAccountAction(req, action, metadata) {
  const { error } = await supabase.from('system_audit_log').insert({
    actor_id: req.authUser.id,
    action,
    target_type: 'account',
    target_id: req.member.id,
    metadata: metadata ?? null,
  });
  if (error) console.error('[system_audit_log] insert failed:', error.message);
}

function bearer(req) {
  return (req.headers.authorization || '').slice(7);
}

// The session the caller's own token belongs to (Supabase puts it in the JWT).
function sessionIdOf(req) {
  try {
    return JSON.parse(Buffer.from(bearer(req).split('.')[1], 'base64url').toString()).session_id ?? null;
  } catch {
    return null;
  }
}

router.get('/admin/account', ...guard, (req, res) => {
  res.json(profileOf(req.member, req.authUser));
});

// PATCH /admin/account  { full_name?, phone? }
router.patch('/admin/account', ...guard, async (req, res, next) => {
  try {
    const patch = {};
    if (req.body?.full_name !== undefined) {
      const name = String(req.body.full_name).trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' });
      patch.full_name = name;
    }
    if (req.body?.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (phone && !/^\+?[0-9][0-9\s-]{6,18}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
      patch.phone = phone || null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });

    const { data, error } = await supabase.from('members').update(patch).eq('id', req.member.id).select('*').single();
    if (error) throw error;
    await logAccountAction(req, 'admin.profile_updated', {
      before: Object.fromEntries(Object.keys(patch).map((k) => [k, req.member[k] ?? null])),
      after: patch,
    });
    res.json(profileOf(data, req.authUser));
  } catch (err) { next(err); }
});

// PUT /admin/account/photo  { data_url: "data:image/png;base64,..." }, or { data_url: null } to remove it.
router.put('/admin/account/photo', ...guard, async (req, res, next) => {
  try {
    let avatarUrl = null;
    if (req.body?.data_url) {
      const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(req.body.data_url));
      const ext = m && PHOTO_TYPES[m[1]];
      if (!ext) return res.status(400).json({ error: 'Use a PNG, JPG or WebP image.' });
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > MAX_PHOTO_BYTES) return res.status(400).json({ error: 'Photo must be 2 MB or smaller.' });

      const path = `${req.member.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: m[1], upsert: true });
      if (upErr) throw upErr;
      avatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { data, error } = await supabase.from('members').update({ avatar_url: avatarUrl }).eq('id', req.member.id).select('*').single();
    if (error) throw error;
    await logAccountAction(req, avatarUrl ? 'admin.photo_updated' : 'admin.photo_removed');
    res.json(profileOf(data, req.authUser));
  } catch (err) { next(err); }
});

// POST /admin/account/password  { current_password, new_password }
router.post('/admin/account/password', ...guard, async (req, res, next) => {
  try {
    const current = String(req.body?.current_password ?? '');
    const fresh = String(req.body?.new_password ?? '');
    if (!current || !fresh) return res.status(400).json({ error: 'Enter your current and new password.' });
    if (fresh.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (fresh === current) return res.status(400).json({ error: 'New password must be different from the current one.' });

    // Verify the current password with a throwaway sign-in on its own client
    // (signing in on the shared service-role client would swap its credentials),
    // then revoke that extra session so it never shows in the session list.
    const verifier = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: check, error: checkErr } = await verifier.auth.signInWithPassword({ email: req.authUser.email, password: current });
    if (checkErr || !check?.session) return res.status(400).json({ error: 'Current password is incorrect.' });
    await supabase.auth.admin.signOut(check.session.access_token, 'local');

    const { error } = await supabase.auth.admin.updateUserById(req.authUser.id, { password: fresh });
    if (error) return res.status(400).json({ error: error.message });
    await logAccountAction(req, 'admin.password_changed');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /admin/account/sessions — the admin's live Supabase sessions (migration 0067).
router.get('/admin/account/sessions', ...guard, async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('auth_sessions_for', { p_user_id: req.authUser.id });
    if (error) {
      // Migration 0067 not applied yet: the page falls back to login history only.
      if (error.code === 'PGRST202' || /auth_sessions_for/.test(error.message)) return res.json({ sessions: null });
      throw error;
    }
    const currentId = sessionIdOf(req);
    res.json({ sessions: (data ?? []).map((s) => ({ ...s, current: s.id === currentId })) });
  } catch (err) { next(err); }
});

// POST /admin/account/sessions/revoke  { scope: 'others' | 'global' }
// Revokes the account's refresh tokens: other browsers are signed out once
// their current access token expires (at most an hour).
router.post('/admin/account/sessions/revoke', ...guard, async (req, res, next) => {
  try {
    const scope = req.body?.scope === 'others' ? 'others' : 'global';
    const { error } = await supabase.auth.admin.signOut(bearer(req), scope);
    if (error) throw error;
    await logAccountAction(req, 'admin.sessions_revoked', { scope });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
