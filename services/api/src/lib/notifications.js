/**
 * services/api/src/lib/notifications.js
 * Writes to the `notifications` table (migration 0001) and fans the same
 * event out to any registered devices via Expo push (migration 0022,
 * push_tokens). The DB row is what drives the in-app Notification Center —
 * the mobile app also gets it instantly over Supabase Realtime, since
 * `notifications` has RLS + a realtime publication entry. The push send is
 * for when the app is backgrounded/killed and can't be reached that way.
 *
 * Fire-and-forget by design: neither the DB write nor the push send may ever
 * fail the money/approval action that triggered them, so errors are logged,
 * not thrown.
 *
 * Every notify() call in the app funnels through here, which makes this the
 * one place to enforce a member's notification_preferences (migration 0058,
 * set via PATCH /api/me/notification-preferences) — a `type` is mapped to a
 * category, and if that category is off, both the DB write and the push are
 * skipped. Categories aren't in this codebase anywhere else, so this map is
 * the source of truth for which `type` belongs to which toggle.
 */
const supabase = require('../config/supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const DEFAULT_PREFERENCES = {
  payments: true,
  loans: true,
  group_announcements: true,
  direct_messages: true,
  account_security: true,
};

// Matched by prefix (e.g. "loan.approved" -> "loan"). A type with no match
// falls through ungated — better to over-notify an uncategorized event than
// silently drop something nobody can turn off.
const CATEGORY_BY_PREFIX = {
  loan: 'loans',
  contribution: 'payments',
  gcash: 'payments',
  payment: 'payments',
  ledger: 'payments',
  penalty: 'payments',
  membership: 'group_announcements',
  distribution: 'group_announcements',
  announcement: 'group_announcements',
  balance: 'group_announcements',
  direct_message: 'direct_messages',
  identity: 'account_security',
  audit: 'account_security',
  profile_update: 'account_security',
};

function categoryFor(type) {
  const prefix = type.split('.')[0];
  return CATEGORY_BY_PREFIX[prefix] ?? null;
}

async function isCategoryEnabled(memberId, type) {
  const category = categoryFor(type);
  if (!category) return true; // uncategorized types are never gated
  const { data, error } = await supabase
    .from('members').select('notification_preferences').eq('id', memberId).single();
  if (error || !data) return true; // best-effort — don't block a real notification over a lookup failure
  const prefs = { ...DEFAULT_PREFERENCES, ...(data.notification_preferences ?? {}) };
  return prefs[category] !== false;
}

async function sendPush(memberId, { title, message, type }) {
  const { data: tokens, error } = await supabase
    .from('push_tokens').select('token').eq('member_id', memberId);
  if (error || !tokens?.length) return;

  const payload = tokens.map((t) => ({
    to: t.token,
    title: title ?? 'KapitPondo',
    body: message ?? '',
    data: { type },
    sound: 'default',
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[notifications] Expo push send failed with status ${res.status}`);
    }
  } catch (err) {
    console.error('[notifications] Expo push send failed:', err.message);
  }
}

async function notify({ memberId, groupId = null, type, title, message }) {
  if (!memberId || !type) return;
  if (!(await isCategoryEnabled(memberId, type))) return;
  const { error } = await supabase.from('notifications').insert({
    member_id: memberId,
    group_id: groupId,
    type,
    title: title ?? null,
    message: message ?? null,
  });
  if (error) {
    console.error(`[notifications] failed to write "${type}" for member ${memberId}:`, error.message);
    return;
  }
  await sendPush(memberId, { title, message, type });
}

module.exports = { notify };
