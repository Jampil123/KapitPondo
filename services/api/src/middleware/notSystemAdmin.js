const supabase = require('../config/supabase');

// Runs after requireAuth, on a group's contribution / loan / repayment
// decision routes (confirm, verify, approve, review, disburse, reject,
// dispute). The System Administrator monitors fund groups read-only and never
// decides on a group's money — even when their account also holds an officer
// role in that group. Those decisions stay with the group's own officers.
async function notSystemAdmin(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', req.authUser?.id)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return res.status(403).json({
        error: "System administrators can't approve or reject a group's contributions or loans. That stays with the group's officers.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = notSystemAdmin;
