/**
 * services/api/src/middleware/requireSysadmin.js
 * Gate for all /admin routes: verify the Supabase JWT, then confirm an active
 * platform admin. Attaches req.admin = { user_id, email }.
 */
const { supabaseAdmin } = require('../lib/supabaseAdmin');

async function requireSysadmin(req, res, next) {
  try {
    const header = req.headers.authorization;
    const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });

    const { data: adminRow } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id, email, active')
      .eq('user_id', userData.user.id)
      .eq('active', true)
      .maybeSingle();

    if (!adminRow) return res.status(403).json({ error: 'Not a system administrator' });

    req.admin = { user_id: userData.user.id, email: adminRow.email || userData.user.email };
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { requireSysadmin };