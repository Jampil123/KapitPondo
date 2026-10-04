const supabaseAdmin = require('../config/supabase');
const { groupSuspension, suspendedGroupMessage, isPlatformAdminUser } = require('../lib/groupSuspension');

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

      if (req.method !== 'GET') {
        // A fund group the System Administrator suspended is read-only for
        // everyone in it until reinstated (migration 0065).
        const suspension = await groupSuspension(groupId);
        if (suspension) {
          return res.status(403).json({ error: suspendedGroupMessage(suspension), group_suspended: true });
        }
        // Separation of platform administration and fund management: an
        // account that is a System Administrator can't take officer actions
        // (approvals, ledger, cycle terms, recording transactions) even in a
        // group where it holds an officer role. Member-level actions — paying
        // their own contribution, applying for a loan — still work.
        const officerOnly = allowedRoles && !allowedRoles.includes('member');
        if (officerOnly && (await isPlatformAdminUser(req.authUser?.id))) {
          return res.status(403).json({
            error: "System administrators can't manage a group's funds. That stays with the group's officers.",
          });
        }
      }

      req.membership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireGroupRole;