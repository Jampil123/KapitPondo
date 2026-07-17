// Live verification of the Notification Center read-side (list, mark-one-read,
// mark-all-read). Member A already has identity.rejected + identity.verified
// notifications from the earlier M1 test.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API = 'http://localhost:4000/api';

const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' };

async function tokenFor(creds) {
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword(creds);
  if (error) throw error;
  return data.session.access_token;
}

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const token = await tokenFor(MEMBER_A);

  console.log('--- GET /me/notifications ---');
  let r = await call('GET', '/me/notifications', token);
  console.log('status:', r.status, 'count:', r.json.notifications.length);
  r.json.notifications.forEach((n) => console.log(`  [${n.is_read ? 'read' : 'UNREAD'}] ${n.type}: ${n.title}`));
  const firstUnread = r.json.notifications.find((n) => !n.is_read);

  if (firstUnread) {
    console.log('\n--- POST /me/notifications/:id/read (one) ---');
    r = await call('POST', `/me/notifications/${firstUnread.id}/read`, token);
    console.log('status:', r.status, 'is_read now:', r.json.notification?.is_read);
  }

  console.log('\n--- GET /me/notifications?unread=true (before mark-all) ---');
  r = await call('GET', '/me/notifications?unread=true', token);
  console.log('unread count:', r.json.notifications.length);

  console.log('\n--- POST /me/notifications/read-all ---');
  r = await call('POST', '/me/notifications/read-all', token);
  console.log('status:', r.status, r.json);

  console.log('\n--- GET /me/notifications?unread=true (after mark-all) ---');
  r = await call('GET', '/me/notifications?unread=true', token);
  console.log('unread count:', r.json.notifications.length);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
