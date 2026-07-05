/**
 * services/api/scripts/seed-admin.js
 * ----------------------------------------------------------------------------
 * Creates the STATIC admin auth user (idempotent) and links it in
 * platform_admins — reproducible across local resets.
 *
 * Run:  node services/api/scripts/seed-admin.js
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
 *
 * The service-role key is used ONLY here (server-side seeding).
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL || 'admin@kapitpondo.local';
const password = process.env.ADMIN_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or ADMIN_PASSWORD');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // 1) Find or create the auth user (email pre-confirmed, no registration flow).
  const { data: list } = await admin.auth.admin.listUsers();
  let user = (list && list.users.find((u) => u.email === email)) || null;

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log('Created admin auth user:', email);
  } else {
    console.log('Admin auth user already exists:', email);
  }

  // 2) Link into platform_admins (idempotent).
  const { error: linkErr } = await admin
    .from('platform_admins')
    .upsert({ user_id: user.id, email, active: true }, { onConflict: 'user_id' });
  if (linkErr) throw linkErr;

  console.log('Linked into platform_admins. Static admin ready:', email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});