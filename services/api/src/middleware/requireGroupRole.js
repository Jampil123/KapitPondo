const supabaseAdmin = require('../config/supabase');

// Usage: requireGroupRole(['owner', 'treasurer'])
// Looks for a group id in params, body, or query.
function requireGroupRole(allowedRoles) {
  return async function (req, res, next) {
    try {
      const groupId = req.params.groupId || req.body.group_id || req.query.group_id;
      if (!groupId) {
        return res.status(400).json({ error: 'group_id is required' });
      }

      const { data: membership, error } = await supabaseAdmin
        .from('memberships')
        .select('*')
        .eq('member_id', req.member.id)
        .eq('group_id', groupId)
        .in('status', ['active', 'suspended'])
        .single();

      if (error || !membership) {
        return res.status(403).json({ error: 'You are not an active member of this group' });
      }
      // Suspended members can still look at their records, but not change anything.
      if (membership.status === 'suspended' && req.method !== 'GET') {
        return res.status(403).json({ error: 'Your membership is suspended. You can view your records, but not make changes.' });
      }
      if (allowedRoles && !allowedRoles.includes(membership.role)) {
        return res.status(403).json({ error: 'Insufficient role for this action' });
      }

      req.membership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireGroupRole;