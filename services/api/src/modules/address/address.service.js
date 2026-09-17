/**
 * services/api/src/modules/address/address.service.js
 * ----------------------------------------------------------------------------
 * Province/city/barangay data for the identity wizard's residential-address
 * step, sourced live from the official PSGC REST API (psgc.gitlab.io — free,
 * no key, always current) instead of the bundled `psgc` npm package the rest
 * of this codebase (idFieldParser.js) and the mobile app used to rely on
 * alone. That bundled package is kept here ONLY as an offline fallback if the
 * live API is unreachable — never as the primary source — so a network blip
 * on a third-party host can't break the wizard.
 *
 * Unlike the bundled dataset (which matches barangays to a city by NAME ONLY,
 * so same-named towns in different provinces — e.g. 9 different "San Isidro"
 * towns — can pull in the wrong town's barangays), the live API is
 * code-keyed: cities are looked up by their PSGC province code, and
 * barangays by their PSGC city code, resolved from the name the caller
 * passed in. That's the actual accuracy improvement here, not just "newer
 * data" — the ambiguity is structurally impossible with this approach.
 *
 * Zip codes aren't PSGC data at all (a separate PHLPost dataset with no
 * public API). zipcodes.json here is vendored from the MIT-licensed
 * `addresspinas` npm package (https://www.npmjs.com/package/@harlandgomez/addresspinas) —
 * a flat { "1001": "Quiapo", ... } map of zip -> district/city label, not
 * keyed to any PSGC code. There is no clean, authoritative zip<->barangay
 * join publicly available, so zip validation below is deliberately
 * best-effort fuzzy name matching, not a guarantee — see checkZip's own
 * comment.
 */
const fallbackProvinces = require('psgc/dist/data/provinces.json');
const fallbackMunicipalities = require('psgc/dist/data/municipalities.json');
const fallbackBarangays = require('psgc/dist/data/barangays.json');
const zipLabels = require('../../integrations/address/zipcodes.json');

const PSGC_BASE = process.env.PSGC_API_BASE_URL || 'https://psgc.gitlab.io/api';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // admin boundaries change rarely

const cache = new Map(); // key -> { data, expiresAt }

async function fetchJson(path) {
  const res = await fetch(`${PSGC_BASE}${path}`);
  if (!res.ok) {
    throw Object.assign(new Error(`PSGC API request failed (${res.status})`), { status: 502 });
  }
  return res.json();
}

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data = await loader();
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

function toOptions(names) {
  return [...new Set(names)]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ label: name, value: name }));
}

function matchesName(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function liveProvinces() {
  return cached('provinces', () => fetchJson('/provinces/'));
}

async function liveCities(provinceCode) {
  return cached(`cities:${provinceCode}`, () => fetchJson(`/provinces/${provinceCode}/cities-municipalities/`));
}

async function liveBarangays(cityCode) {
  return cached(`barangays:${cityCode}`, () => fetchJson(`/cities-municipalities/${cityCode}/barangays/`));
}

async function listProvinces() {
  try {
    const provinces = await liveProvinces();
    return toOptions(provinces.map((p) => p.name));
  } catch (err) {
    console.warn('[address] live PSGC provinces fetch failed, using bundled fallback:', err.message ?? err);
    return toOptions(fallbackProvinces.map((p) => p.name));
  }
}

async function listCities(provinceName) {
  try {
    const provinces = await liveProvinces();
    const province = provinces.find((p) => matchesName(p.name, provinceName));
    if (!province) throw Object.assign(new Error(`Unknown province: ${provinceName}`), { status: 404 });
    const cities = await liveCities(province.code);
    return toOptions(cities.map((c) => c.name));
  } catch (err) {
    if (err.status === 404) throw err;
    console.warn('[address] live PSGC cities fetch failed, using bundled fallback:', err.message ?? err);
    return toOptions(fallbackMunicipalities.filter((m) => matchesName(m.province, provinceName)).map((m) => m.name));
  }
}

// Scoped by BOTH province and city (unlike the old bundled-dataset picker,
// which only took a city name) — that's what lets this resolve the correct
// PSGC city code even when the city name is reused across provinces.
async function listBarangays(provinceName, cityName) {
  try {
    const provinces = await liveProvinces();
    const province = provinces.find((p) => matchesName(p.name, provinceName));
    if (!province) throw Object.assign(new Error(`Unknown province: ${provinceName}`), { status: 404 });
    const cities = await liveCities(province.code);
    const city = cities.find((c) => matchesName(c.name, cityName));
    if (!city) throw Object.assign(new Error(`Unknown city: ${cityName}`), { status: 404 });
    const barangays = await liveBarangays(city.code);
    return toOptions(barangays.map((b) => b.name));
  } catch (err) {
    if (err.status === 404) throw err;
    console.warn('[address] live PSGC barangays fetch failed, using bundled fallback:', err.message ?? err);
    return toOptions(fallbackBarangays.filter((b) => matchesName(b.citymun, cityName)).map((b) => b.name));
  }
}

// A handful of entries (mostly Quezon City's district-level zips) map to an
// ARRAY of district/barangay names instead of one string — normalize both
// shapes into a single lowercase string to search against.
function labelText(label) {
  return (Array.isArray(label) ? label.join(' ') : String(label)).toLowerCase();
}

// Metro Manila's ~17 cities are the one place PH zip codes are assigned per
// historic DISTRICT/neighborhood (e.g. "1001":"Quiapo", "1109":"Cubao")
// rather than per city — so a district label will almost never contain the
// city's own name, even for a perfectly correct entry (confirmed by testing:
// naive substring matching flagged genuine Manila/Quiapo pairs as invalid).
// For these cities we only confirm the zip is a real NCR-range (1xxx) code,
// not which specific district it names — going further isn't reliable with
// data that's structured this way.
const NCR_CITIES = new Set([
  'manila', 'quezon city', 'caloocan', 'las piñas', 'las pinas', 'makati', 'malabon',
  'mandaluyong', 'marikina', 'muntinlupa', 'navotas', 'parañaque', 'paranaque', 'pasay',
  'pasig', 'san juan', 'taguig', 'valenzuela', 'pateros',
]);

// Best-effort, not a guarantee — see this module's header comment. Outside
// NCR, most towns get one zip code labeled with the town's own name (e.g.
// "6000":"Cebu City"), so a direct fuzzy match against the label is reliable
// there. A gap in the vendored dataset (zip not present, or no comparable
// entries for that city) never blocks the member — only a CONFIDENT mismatch
// against a differently-named place does.
function checkZip({ province, city, zip }) {
  const label = zipLabels[zip];
  if (!label) {
    return { valid: true, knownZips: [], reason: 'zip not found in the vendored dataset — not verified either way' };
  }

  const cityKey = city.trim().toLowerCase();
  if (NCR_CITIES.has(cityKey) || /metro manila|ncr|national capital region/i.test(province)) {
    return { valid: zip.startsWith('1'), knownZips: [] };
  }

  const labelLower = labelText(label);
  const isMatch =
    labelLower.includes(cityKey) ||
    cityKey.includes(labelLower) ||
    labelLower.includes(province.trim().toLowerCase());

  const knownZips = Object.entries(zipLabels)
    .filter(([, l]) => labelText(l).includes(cityKey))
    .map(([z]) => z);

  return { valid: isMatch || knownZips.length === 0, knownZips };
}

module.exports = { listProvinces, listCities, listBarangays, checkZip };
