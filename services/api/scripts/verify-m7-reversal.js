// Live verification of the M7 reversal workflow:
//   TC-021: Treasurer initiates a reversal — nothing posts to the ledger yet.
//   TC-026: Auditor verifies it -> proceeds to Owner; Owner finalizes, which
//           is the only step that actually posts the reversing entry.
// Also checks the reject path and the double-request guard.
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'http://localhost:4000/api';

const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' }; // owner
const MEMBER_B = { email: 'e2e.memberb@kapitpondo.test', password: 'KapitE2E_MemberB1!' }; // treasurer

async function signIn(creds) {
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword(creds);
  if (error) throw error;
  return { token: data.session.access_token };
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

const results = [];
function record(name, pass) { results.push({ name, pass }); console.log(pass ? `PASS: ${name}` : `FAIL: ${name}`); }

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const adminToken = await signIn({ email: 'e2e.admin@kapitpondo.test', password: 'KapitE2E_Admin1!' }).then(x => x.token);
  const a = await signIn(MEMBER_A); // owner
  const b = await signIn(MEMBER_B); // treasurer

  console.log('--- create a 3rd ad-hoc user for Auditor ---');
  const auditorEmail = `m7auditor+${Date.now()}@kapitpondo.test`;
  await admin.auth.admin.createUser({ email: auditorEmail, password: 'Auditor123!', email_confirm: true });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signedIn } = await anon.auth.signInWithPassword({ email: auditorEmail, password: 'Auditor123!' });
  const auditorToken = signedIn.session.access_token;
  const { data: auditorMemberRow } = await admin.from('members').select('id').eq('auth_id', signedIn.user.id).single();

  console.log('\n--- Member A creates a group (owner) ---');
  let r = await call('POST', '/groups', a.token, { name: 'M7 Reversal Test Group', fund_code: `M7REV-${Date.now()}` });
  const groupId = r.json.group.id;
  const fundCode = r.json.group.fund_code;

  console.log('\n--- Member B joins as Treasurer, auditor user joins as Auditor ---');
  r = await call('POST', '/groups/join-by-code', b.token, { fund_code: fundCode });
  const memberBId = r.json.membership.member_id;
  await call('PATCH', `/groups/${groupId}/members/${memberBId}/approve`, a.token);
  await call('POST', '/me/identity', b.token, { id_document_url: `kyc/m7b-${Date.now()}.jpg`, id_type: 'national_id' });
  await call('POST', `/admin/verifications/${memberBId}/approve`, adminToken);
  await call('PATCH', `/groups/${groupId}/members/${memberBId}/role`, a.token, { role: 'treasurer' });

  r = await call('POST', '/groups/join-by-code', auditorToken, { fund_code: fundCode });
  await call('PATCH', `/groups/${groupId}/members/${auditorMemberRow.id}/approve`, a.token);
  await call('POST', '/me/identity', auditorToken, { id_document_url: `kyc/m7aud-${Date.now()}.jpg`, id_type: 'national_id' });
  await call('POST', `/admin/verifications/${auditorMemberRow.id}/approve`, adminToken);
  await call('PATCH', `/groups/${groupId}/members/${auditorMemberRow.id}/role`, a.token, { role: 'auditor' });

  console.log('\n--- post an entry to reverse: Member B contributes, Member A approves ---');
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, { name: 'Cycle', contribution_amount: '1000.00', start_date: '2026-01-01' });
  const cycleId = r.json.cycle.id;
  r = await call('POST', `/groups/${groupId}/contributions`, b.token, { cycle_id: cycleId, amount: 1000 });
  r = await call('POST', `/groups/${groupId}/contributions/${r.json.contribution.id}/approve`, a.token);
  const entryId = r.json.ledgerEntry.id;
  console.log('original ledger entry:', entryId);

  console.log('\n=== TC-021: Treasurer initiates a reversal request ===');
  r = await call('POST', `/groups/${groupId}/ledger/${entryId}/reverse`, b.token, { reason: 'Amount entered twice, correcting' });
  console.log(r.status, JSON.stringify(r.json));
  record('Treasurer can initiate a reversal request', r.status === 201 && r.json.request.status === 'pending_verification');
  const requestId = r.json.request.id;

  r = await call('GET', `/groups/${groupId}/reports/ledger`, a.token);
  const hasReversalYet = r.json.ledger?.some((e) => e.entry_type === 'reversal');
  record('No reversal has posted to the ledger yet', !hasReversalYet);

  console.log('\n--- Treasurer cannot verify their own initiated request (wrong role) ---');
  r = await call('POST', `/groups/${groupId}/reversal-requests/${requestId}/verify`, b.token, {});
  record('Treasurer blocked from verifying (auditor-only)', r.status === 403);

  console.log('\n--- Owner cannot finalize before verification ---');
  r = await call('POST', `/groups/${groupId}/reversal-requests/${requestId}/finalize`, a.token);
  record('Owner blocked from finalizing an unverified request', r.status === 409);

  console.log('\n=== TC-026: Auditor verifies ===');
  r = await call('POST', `/groups/${groupId}/reversal-requests/${requestId}/verify`, auditorToken, { notes: 'Checked against original — confirmed duplicate' });
  console.log(r.status, JSON.stringify(r.json));
  record('Auditor verifies -> status verified', r.status === 200 && r.json.request.status === 'verified');

  console.log('\n--- Owner finalizes -> reversing entry actually posts ---');
  r = await call('POST', `/groups/${groupId}/reversal-requests/${requestId}/finalize`, a.token);
  console.log(r.status, JSON.stringify(r.json));
  record('Owner finalizes -> request finalized + reversal entry posted', r.status === 200 && r.json.request.status === 'finalized' && !!r.json.reversalEntry.id);

  r = await call('GET', `/groups/${groupId}/reports/ledger`, a.token);
  const reversalPosted = r.json.ledger?.some((e) => e.entry_type === 'reversal' && e.reverses_entry_id === entryId);
  record('Reversal entry now visible in the ledger, correctly linked', reversalPosted);

  console.log('\n--- double-request guard: cannot start another reversal on the same (already finalized) entry ---');
  r = await call('POST', `/groups/${groupId}/ledger/${entryId}/reverse`, b.token, { reason: 'trying again' });
  record('Cannot re-initiate a reversal on an already-finalized entry', r.status === 409);

  console.log('\n=== reject path: a second entry, Auditor rejects instead ===');
  r = await call('POST', `/groups/${groupId}/contributions`, b.token, { cycle_id: cycleId, amount: 500 });
  r = await call('POST', `/groups/${groupId}/contributions/${r.json.contribution.id}/approve`, a.token);
  const entry2Id = r.json.ledgerEntry.id;
  r = await call('POST', `/groups/${groupId}/ledger/${entry2Id}/reverse`, a.token, { reason: 'testing reject path' });
  const request2Id = r.json.request.id;
  r = await call('POST', `/groups/${groupId}/reversal-requests/${request2Id}/reject`, auditorToken, { notes: 'Not actually a mistake' });
  record('Auditor can reject a pending request', r.status === 200 && r.json.request.status === 'rejected');
  r = await call('POST', `/groups/${groupId}/reversal-requests/${request2Id}/finalize`, a.token);
  record('Owner cannot finalize a rejected request', r.status === 409);

  console.log('\n=== Summary ===');
  const failed = results.filter((x) => !x.pass);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
