const supabaseAdmin = require('../config/supabase');

async function requireAuth(req, res, next) {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase not configured on the server' });
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    // Validate the token with Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Find the member profile linked to this auth user
    const { data: member, error: memberErr } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('auth_id', data.user.id)
      .single();

    if (memberErr || !member) {
      return res.status(403).json({ error: 'No member profile linked to this account' });
    }

    // Platform suspension (migration 0057) withdraws access until an admin
    // reinstates the account. `suspended_at` is absent until that migration
    // runs, in which case this is simply never true.
    if (member.suspended_at) {
      return res.status(403).json({
        error: member.suspension_reason
          ? `Your account is suspended: ${member.suspension_reason}`
          : 'Your account is suspended. Contact support for help.',
        suspended: true,
      });
    }

    req.authUser = data.user;
    req.member = member;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;