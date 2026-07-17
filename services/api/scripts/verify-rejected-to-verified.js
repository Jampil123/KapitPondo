// Live verification of the Rejected -> Verified realtime fix: subscribes to
// the members row exactly like AuthContext.tsx does (postgres_changes UPDATE,
// filter on auth_id, explicit realtime.setAuth), then drives the real
// Rejected -> resubmit -> pending -> admin-approves -> Verified flow and
// measures how fast the "verified" row arrives on the open subscription.
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
  return { supa, session: data.session, authId: data.user.id };
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

  console.log('--- Member B current profile ---');
  let r = await call('GET', '/me/profile', bToken);
  console.log('verification_status:', r.json.member.verification_status, '| reason:', r.json.member.verification_rejection_reason);
  const memberBId = r.json.member.id;

  if (r.json.member.verification_status !== 'rejected') {
    console.log('\n(not currently rejected — rejecting first so we have a real Rejected state to start from)');
    await call('POST', '/me/identity', bToken, { id_document_url: `kyc/setup-${Date.now()}.jpg`, id_type: 'national_id' });
    await call('POST', `/admin/verifications/${memberBId}/reject`, adminToken, { reason: 'Setup for realtime test' });
  }

  console.log('\n--- Member B opens a Realtime subscription on their OWN members row (mirrors AuthContext.tsx) ---');
  const events = [];
  b.supa.realtime.setAuth(bToken);
  const channel = b.supa
    .channel(`verify-members:${b.authId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'members', filter: `auth_id=eq.${b.authId}` },
      (payload) => { events.push({ at: Date.now(), row: payload.new }); },
    )
    .subscribe();

  let subscribedAt = null;
  await new Promise((resolve) => {
    channel.subscribe((status) => { if (status === 'SUBSCRIBED' && !subscribedAt) { subscribedAt = Date.now(); resolve(); } });
    setTimeout(resolve, 4000); // safety timeout
  });
  console.log('subscribed:', !!subscribedAt);

  console.log('\n--- Member B resubmits a new ID (Rejected -> Pending) ---');
  r = await call('POST', '/me/identity', bToken, { id_document_url: `kyc/resubmit-${Date.now()}.jpg`, id_type: 'national_id' });
  console.log('status:', r.status, r.json.member?.verification_status);

  await sleep(1500); // let the resubmit's own realtime event land and settle first

  console.log('\n--- Admin approves the resubmitted ID (Pending -> Verified) ---');
  const approveAt = Date.now();
  r = await call('POST', `/admin/verifications/${memberBId}/approve`, adminToken);
  console.log('status:', r.status, r.json.message);

  console.log('\n--- waiting for the realtime UPDATE event carrying verification_status: verified ---');
  let verifiedEvent = null;
  for (let i = 0; i < 50 && !verifiedEvent; i++) {
    verifiedEvent = events.find((e) => e.row.verification_status === 'verified' && e.at >= approveAt - 50);
    if (!verifiedEvent) await sleep(100);
  }

  if (verifiedEvent) {
    console.log(`RECEIVED "verified" update via realtime in ${verifiedEvent.at - approveAt}ms`);
    console.log('verification_status:', verifiedEvent.row.verification_status);
    console.log('verification_rejection_reason:', verifiedEvent.row.verification_rejection_reason);
  } else {
    console.log('NOT RECEIVED within 5s — realtime members sync failed.');
    console.log('All events received:', JSON.stringify(events, null, 2));
  }

  await b.supa.removeChannel(channel);
  process.exit(verifiedEvent ? 0 : 1);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
