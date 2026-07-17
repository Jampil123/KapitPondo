// One-shot live verification of the M1 notification/rejection-reason fix.
// Drives the real HTTP API against the seeded e2e accounts.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API = 'http://localhost:4000/api';

const ADMIN = { email: 'e2e.admin@kapitpondo.test', password: 'KapitE2E_Admin1!' };
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
  console.log('--- signing in ---');
  const memberToken = await tokenFor(MEMBER_A);
  const adminToken = await tokenFor(ADMIN);

  console.log('\n--- member A: submit identity (unverified -> pending) ---');
  let r = await call('POST', '/me/identity', memberToken, {
    id_document_url: 'kyc/e2e-test-id.jpg',
    id_type: 'national_id',
  });
  console.log(r.status, r.json.message || r.json);
  const memberId = r.json.member.id;

  console.log('\n--- admin: reject with a reason ---');
  r = await call('POST', `/admin/verifications/${memberId}/reject`, adminToken, {
    reason: 'ID photo unreadable, please resubmit',
  });
  console.log(r.status, r.json);

  console.log('\n--- member A: check own profile for the reason ---');
  r = await call('GET', '/me/profile', memberToken);
  console.log('verification_status:', r.json.member.verification_status);
  console.log('verification_rejection_reason:', r.json.member.verification_rejection_reason);

  console.log('\n--- checking notifications table directly (service role) ---');
  const { SUPABASE_SERVICE_ROLE_KEY } = require('dotenv').config({ path: 'd:/ASH/Capstone/KapitPondo/services/api/.env' }).parsed;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let { data: notifs } = await admin.from('notifications').select('*').eq('member_id', memberId).order('created_at', { ascending: false });
  console.log(JSON.stringify(notifs, null, 2));

  console.log('\n--- member A: resubmit identity (rejected -> pending, reason should clear) ---');
  r = await call('POST', '/me/identity', memberToken, {
    id_document_url: 'kyc/e2e-test-id-v2.jpg',
    id_type: 'national_id',
  });
  console.log(r.status, r.json.member.verification_status, 'reason:', r.json.member.verification_rejection_reason);

  console.log('\n--- admin: approve ---');
  r = await call('POST', `/admin/verifications/${memberId}/approve`, adminToken, {});
  console.log(r.status, r.json);

  console.log('\n--- member A: final profile check ---');
  r = await call('GET', '/me/profile', memberToken);
  console.log('verification_status:', r.json.member.verification_status);
  console.log('verification_rejection_reason:', r.json.member.verification_rejection_reason);

  console.log('\n--- notifications table after approve ---');
  ({ data: notifs } = await admin.from('notifications').select('*').eq('member_id', memberId).order('created_at', { ascending: false }));
  console.log(JSON.stringify(notifs, null, 2));
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
