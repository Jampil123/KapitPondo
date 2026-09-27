const supabase = require('../config/supabase');

// Runs after requireAuth. platform_admins is the single source of truth for
// who is a system administrator (the SQL is_sysadmin() helper reads it too).
async function requireSystemAdmin(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', req.authUser?.id)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(403).json({ error: 'System administrator access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireSystemAdmin;
