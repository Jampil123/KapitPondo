const dotenv = require('dotenv');
dotenv.config({ quiet: true });

// Dashboard-pasted values often keep their quotes or spaces; strip both.
function clean(name) {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const v = raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  if (v !== raw) process.env[name] = v;
  return v || undefined;
}

['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'GOOGLE_VISION_API_KEY'].forEach(clean);

const port = process.env.PORT || 4000;
let supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Describes a bad value without printing it (it may be a key pasted into the wrong field).
if (supabaseUrl && !/^https?:\/\//i.test(supabaseUrl)) {
  const hint = /^SUPABASE_URL=/i.test(supabaseUrl) ? 'the value includes "SUPABASE_URL=" — paste only the URL'
    : /^(eyJ|sb_)/.test(supabaseUrl) ? 'the value looks like an API key, not the project URL'
      : `it starts with "${supabaseUrl.slice(0, 8)}…"`;
  console.error(`SUPABASE_URL is invalid (${hint}). Expected https://<project-ref>.supabase.co. Database features are off until it's fixed.`);
  supabaseUrl = undefined;
}

if (!supabaseUrl || !supabaseServiceKey) {
  const missing = [!supabaseUrl && 'SUPABASE_URL', !supabaseServiceKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean).join(', ');
  console.warn(`Supabase not configured (${missing}). The server will run, but database features stay off until they're set.`);
}

module.exports = { port, supabaseUrl, supabaseServiceKey };
