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
 */
const supabase = require('../config/supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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
