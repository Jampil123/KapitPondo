// Live verification of real-time notification delivery:
//   1. Member B registers a (fake) push token.
//   2. Member B opens a genuine Supabase Realtime subscription (anon key,
//      their own JWT) on notifications, filtered to their own member_id.
//   3. Sysadmin rejects Member B's identity verification via the real API.
//   4. We measure the time between the admin's HTTP call returning and the
//      realtime event arriving on Member B's channel — no polling involved.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API = 'http://localhost:4000/api';

const ADMIN = { email: 'e2e.admin@kapitpondo.test', password: 'KapitE2E_Admin1!' };
const MEMBER_B = { email: 'e2e.memberb@kapitpondo.test', password: 'KapitE2E_MemberB1!' };

async function signIn(creds) {
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword(creds);
  if (error) throw error;
  // Realtime's websocket auth doesn't always pick up the session automatically
  // when persistSession is off — bind it explicitly so RLS applies to the socket.
  supa.realtime.setAuth(data.session.access_token);
  return { supa, session: data.session, userId: data.user.id };
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const b = await signIn(MEMBER_B);
  const admin = await signIn(ADMIN);
  const bToken = b.session.access_token;
  const adminToken = admin.session.access_token;

  console.log('--- fetch Member B profile (get member.id) ---');
  let r = await call('GET', '/me/profile', bToken);
  const memberBId = r.json.member.id;
  console.log('member_id:', memberBId, 'verification_status:', r.json.member.verification_status);

  console.log('\n--- register a fake push token for Member B ---');
  r = await call('POST', '/me/push-token', bToken, { token: 'ExponentPushToken[fake-test-token-xyz]', platform: 'android' });
  console.log('status:', r.status, r.json);

  console.log('\n--- Member B submits identity (-> pending) so it can be rejected ---');
  r = await call('POST', '/me/identity', bToken, { id_document_url: `kyc/realtime-test-${Date.now()}.jpg`, id_type: 'national_id' });
  console.log('status:', r.status, r.json.member?.verification_status);

  console.log('\n--- Member B opens a Realtime subscription on their own notifications ---');
  let received = null;
  let subscribedAt = null;
  const channel = b.supa
    .channel(`verify-notifications:${memberBId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${memberBId}` },
      (payload) => { received = { at: Date.now(), row: payload.new }; },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') subscribedAt = Date.now();
    });

  // Wait for the subscription to actually be live before triggering the event.
  for (let i = 0; i < 40 && !subscribedAt; i++) await sleep(100);
  console.log('subscribed:', !!subscribedAt);

  console.log('\n--- Admin rejects Member B\'s identity verification (the real trigger) ---');
  const triggerAt = Date.now();
  r = await call('POST', `/admin/verifications/${memberBId}/reject`, adminToken, { reason: 'Realtime delivery test' });
  console.log('status:', r.status, r.json.message);

  console.log('\n--- waiting for the realtime event (no polling) ---');
  for (let i = 0; i < 50 && !received; i++) await sleep(100); // up to 5s
  if (received) {
    console.log(`RECEIVED via realtime in ${received.at - triggerAt}ms`);
    console.log('row:', JSON.stringify(received.row, null, 2));
  } else {
    console.log('NOT RECEIVED within 5s — realtime delivery failed.');
  }

  await b.supa.removeChannel(channel);
  process.exit(received ? 0 : 1);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
