/**
 * services/api/src/integrations/ocr/idFieldParser.js
 * ----------------------------------------------------------------------------
 * Turns the raw text Google Vision reads off a PH government ID into the
 * structured fields the identity wizard's step 3 wants — first/middle/last
 * name, birthday, sex, ID number, and address parts. Used instead of
 * Gemini (integrations/ai/gemini.js's structureIdImage) specifically to
 * avoid the Gemini API's request quota; this only calls Vision's OCR
 * (already used elsewhere in the app) and parses the text itself with
 * label-keyword matching and a PSGC lookup for province/city/barangay.
 *
 * HONEST LIMITATION: unlike an LLM, this is pattern-matching over raw OCR
 * text, not language understanding. PH ID layouts vary a lot (PhilSys,
 * driver's license, passport, UMID, PRC, voter's, postal, SSS, GSIS all
 * print things differently, some bilingual Filipino/English), OCR itself
 * introduces character-level noise, and the address split relies on the ID
 * literally containing a recognizable PSGC city/barangay name as a
 * substring. Expect this to work well on clear, well-lit PhilSys/driver's-
 * license shots and to miss fields (returning null, not a guess) on
 * anything it can't confidently match — same "advisory draft, member
 * reviews everything" rule as the Gemini version.
 */
const municipalities = require('psgc/dist/data/municipalities.json');
const barangays = require('psgc/dist/data/barangays.json');

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Finds a birthdate-looking token, preferring one that sits near a
// birth-related label; falls back to the earliest-year date anywhere in the
// text (issue/expiry dates on an ID are usually more recent than a birthdate).
function findBirthday(text) {
  const lines = text.split('\n');
  const numericDate = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
  const monthNameDate = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i;
  const birthLabel = /(DATE OF BIRTH|BIRTHDATE|BIRTH DATE|PETSA NG KAPANGANAKAN|KAPANGANAKAN|\bDOB\b)/i;

  function toMmDdYyyy(m, isMonthName) {
    if (isMonthName) {
      const mm = MONTHS[m[1].slice(0, 3).toUpperCase()];
      if (!mm) return null;
      return `${mm}/${pad2(m[2])}/${m[3]}`;
    }
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    // Printed PH IDs are overwhelmingly MM/DD/YYYY; if the first number can't
    // be a month, assume it was written DD/MM/YYYY and swap.
    const [mm, dd] = a > 12 && b <= 12 ? [b, a] : [a, b];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${pad2(mm)}/${pad2(dd)}/${m[3]}`;
  }

  for (let i = 0; i < lines.length; i++) {
    if (!birthLabel.test(lines[i])) continue;
    const nearby = `${lines[i]} ${lines[i + 1] ?? ''}`;
    const mn = nearby.match(monthNameDate);
    if (mn) return { value: toMmDdYyyy(mn, true), confidence: 'high' };
    const nd = nearby.match(numericDate);
    if (nd) return { value: toMmDdYyyy(nd, false), confidence: 'high' };
  }

  // Fallback: earliest year among all date-looking tokens in the whole text.
  const all = [];
  for (const m of text.matchAll(new RegExp(monthNameDate, 'gi'))) all.push({ m, isMonthName: true });
  for (const m of text.matchAll(new RegExp(numericDate, 'g'))) all.push({ m, isMonthName: false });
  if (!all.length) return { value: null, confidence: 'low' };
  all.sort((x, y) => parseInt(x.m[3], 10) - parseInt(y.m[3], 10));
  const value = toMmDdYyyy(all[0].m, all[0].isMonthName);
  return { value, confidence: value ? 'low' : 'low' };
}

function findSex(text) {
  const labeled = text.match(/(SEX|KASARIAN)\s*[:\-]?\s*(MALE|FEMALE|M|F)\b/i);
  if (labeled) {
    const raw = labeled[2].toUpperCase();
    return raw === 'M' || raw === 'MALE' ? 'male' : 'female';
  }
  if (/\bFEMALE\b/i.test(text)) return 'female';
  if (/\bMALE\b/i.test(text)) return 'male';
  return null;
}

// ID numbers vary a lot in shape (PhilSys's 16-digit PCN with dashes,
// license/passport alphanumerics, etc.) — look for a labeled line first,
// then fall back to the longest digit/dash token that isn't the birthday
// or another already-recognized date.
function findIdNumber(text, birthday) {
  const lines = text.split('\n');
  const label = /(PCN|ID\s*NO\.?|LICENSE\s*NO\.?|PASSPORT\s*NO\.?|CRN|SERIAL\s*NO\.?|UMID)/i;
  const tokenPattern = /[0-9][0-9\-]{5,19}[0-9]/;
  for (const line of lines) {
    if (!label.test(line)) continue;
    const m = line.match(tokenPattern);
    if (m) return { value: m[0], confidence: 'high' };
  }
  const candidates = [...text.matchAll(new RegExp(tokenPattern, 'g'))]
    .map((m) => m[0])
    .filter((t) => t.replace(/-/g, '') !== (birthday ?? '').replace(/\D/g, ''));
  if (candidates.length) return { value: candidates.sort((a, b) => b.length - a.length)[0], confidence: 'low' };
  return { value: null, confidence: 'low' };
}

// Filipino IDs commonly label the name in parts ("Last Name" / "Given
// Name(s)" / "Middle Name", sometimes with a Filipino co-label) — try that
// first; fall back to a "LASTNAME, FIRSTNAME MIDDLENAME" comma line.
function findName(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const result = { first: null, middle: null, last: null, confidence: 'low' };

  const lastLabel = /(LAST\s*NAMES?|APELYIDO|SURNAME)/i;
  const givenLabel = /(GIVEN\s*NAMES?|FIRST\s*NAMES?|PANGALAN)/i;
  const middleLabel = /(MIDDLE\s*NAMES?|GITNANG\s*APELYIDO)/i;

  // Strips the matched label out of the line; if what's left is too short to
  // be a real name (the label regex not requiring a word boundary can leave
  // a stray trailing letter, e.g. "Given Names" -> "s"), the value is on the
  // next line instead.
  function valueFor(label, line, nextLine) {
    const stripped = line.replace(label, '').replace(/[:\-]/g, '').trim();
    return stripped.length >= 2 && !label.test(stripped) ? stripped : (nextLine ?? '').trim();
  }

  for (let i = 0; i < lines.length; i++) {
    if (lastLabel.test(lines[i]) && !result.last) {
      const val = valueFor(lastLabel, lines[i], lines[i + 1]);
      if (val && !lastLabel.test(val)) result.last = val;
    }
    if (givenLabel.test(lines[i]) && !result.first) {
      const val = valueFor(givenLabel, lines[i], lines[i + 1]);
      if (val && !givenLabel.test(val)) result.first = val;
    }
    if (middleLabel.test(lines[i]) && !result.middle) {
      const val = valueFor(middleLabel, lines[i], lines[i + 1]);
      if (val && !middleLabel.test(val)) result.middle = val;
    }
  }
  if (result.last && result.first) {
    result.confidence = 'high';
    return result;
  }

  // Fallback: "DELA CRUZ, JUAN MIGUEL SANTOS" style single line.
  for (const line of lines) {
    const m = line.match(/^([A-ZÑ.\s]{2,30}),\s*([A-ZÑ.\s]{2,40})$/);
    if (m) {
      const given = m[2].trim().split(/\s+/);
      return {
        last: m[1].trim(),
        first: given[0] ?? null,
        middle: given.length > 1 ? given.slice(1).join(' ') : null,
        confidence: 'medium',
      };
    }
  }
  return result;
}

// PH ID addresses almost always spell the barangay out with a "Brgy." or
// "Barangay" label — trust that over free-text scanning when it's there,
// since otherwise a barangay name that happens to collide with an unrelated
// municipality name elsewhere in the country (very common — e.g. many towns
// are named "San Isidro") can get mistaken for the city.
function findBarangayLabel(text) {
  const m = text.match(/\b(?:BRGY\.?|BARANGAY)\s+([A-ZÑ0-9.\-\s]{2,40}?)(?=,|\n|\r|$)/i);
  return m ? m[1].trim().replace(/\s{2,}/g, ' ') : null;
}

// Matches a PSGC municipality/city name against the OCR text. Note the
// dataset stores a city's name WITHOUT the "City" suffix (Quezon City is
// just "Quezon"), so a short city name can otherwise lose a naive
// longest-match comparison to a coincidentally longer barangay name in the
// same text — scoring instead: a name literally followed by "City" in the
// text wins outright, then the dataset's own city:true flag, then length as
// a last tiebreak. `excludeName` skips whatever was already claimed as the
// barangay so the same token isn't assigned to both.
function findCity(text, excludeName) {
  const upper = text.toUpperCase();
  const exclude = excludeName ? excludeName.toUpperCase() : null;
  let best = null;
  for (const m of municipalities) {
    if (m.name.length < 4) continue;
    const nameUpper = m.name.toUpperCase();
    if (exclude && nameUpper === exclude) continue;
    if (!upper.includes(nameUpper)) continue;
    const followedByCity = new RegExp(`${nameUpper}\\s+CITY\\b`).test(upper);
    const score = (followedByCity ? 1000 : 0) + (m.city ? 100 : 0) + nameUpper.length;
    if (!best || score > best.score) best = { ...m, score };
  }
  return best;
}

// Only used as a fallback when the text has no explicit "Brgy./Barangay"
// label to trust (findBarangayLabel) — scoped to the identified city's own
// barangay list so a same-named barangay elsewhere in the country can't
// match instead.
function findBarangayInCity(text, cityName) {
  const upper = text.toUpperCase();
  const pool = cityName ? barangays.filter((b) => b.citymun === cityName) : [];
  let best = null;
  for (const b of pool) {
    const clean = b.name.replace(/\s*\(Pob\.\)\s*/i, '').trim();
    if (clean.length < 4) continue;
    if (upper.includes(clean.toUpperCase()) && (!best || clean.length > best.length)) best = clean;
  }
  return best;
}

function parseIdFields(rawText) {
  const text = rawText || '';
  const name = findName(text);
  const birthday = findBirthday(text);
  const sex = findSex(text);
  const idNumber = findIdNumber(text, birthday.value);

  const labeledBarangay = findBarangayLabel(text);
  const city = findCity(text, labeledBarangay);
  const barangayName = labeledBarangay || (city ? findBarangayInCity(text, city.name) : null);

  const missing = [];
  if (!name.last || !name.first) missing.push('name');
  if (!birthday.value) missing.push('birthday');
  if (!sex) missing.push('sex');
  if (!idNumber.value) missing.push('ID number');
  if (!city) missing.push('city/province');

  const confidences = [name.confidence, birthday.confidence, idNumber.confidence].filter(Boolean);
  const confidence = confidences.includes('high') && missing.length === 0
    ? 'high'
    : confidences.every((c) => c === 'low') || missing.length >= 3
      ? 'low'
      : 'medium';

  return {
    first_name: name.first,
    middle_name: name.middle,
    last_name: name.last,
    birthday: birthday.value,
    sex,
    id_number: idNumber.value,
    nationality: /FILIPINO/i.test(text) ? 'Filipino' : null,
    province: city ? city.province : null,
    // Matches the exact name string the psgc dataset uses (e.g. "Quezon",
    // not "Quezon City") — same dataset the mobile app's province/city/
    // barangay pickers are built from, so this value round-trips into a
    // valid pre-selection there instead of failing to match anything.
    city: city ? city.name : null,
    barangay: barangayName,
    street_address: null, // not reliably separable from OCR text without a labeled "Address" line format that holds across ID types
    confidence,
    notes: missing.length ? `Couldn't confidently read: ${missing.join(', ')}. Please fill these in yourself.` : null,
  };
}

module.exports = { parseIdFields };
