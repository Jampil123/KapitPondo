const supabase = require('../config/supabase');

async function logAudit({ groupId, actorId, actorRole, action, entityType, entityId, before, after }) {
  try {
    const { error } = await supabase.from('audit_log').insert({
      group_id: groupId,
      actor_id: actorId,
      actor_role: actorRole ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      before_data: before ?? null,
      after_data: after ?? null,
    });
    if (error) console.error('[audit_log] insert failed:', error.message);
  } catch (e) {
    console.error('[audit_log] insert threw:', e.message);
  }
}

module.exports = { logAudit };
