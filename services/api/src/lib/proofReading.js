// services/api/src/lib/proofReading.js
// KapitPondo — The server's own reading of an uploaded proof (migration 0076):
// download it from the private `proofs` bucket, OCR it (Google Vision), and
// pull out amount / reference / date / sender with plain pattern matching.
// Saved on the record so the verifier's "Recorded vs Read from proof"
// comparison never depends on what the submitting phone reported.
//
// Best-effort by design: an unreadable photo, a cash slip, or OCR not being
// configured just leaves fields null — the verifier compares by eye. Never
// throws to the caller.

const supabase = require('../config/supabase');
const { extractText } = require('../integrations/ocr/googleVision');

const PESO_RE = /(?:₱|php|p)\s?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function findAmount(text) {
  const lines = text.split('\n');
  const labeled = lines.find((l) => /\bamount\b/i.test(l) && PESO_RE.test(l));
  if (labeled) return Number(labeled.match(PESO_RE)[1].replace(/,/g, ''));
  const all = [...text.matchAll(new RegExp(PESO_RE, 'gi'))].map((m) => Number(m[1].replace(/,/g, '')));
  return all.length ? Math.max(...all) : null;
}

function findReference(text) {
  const labeled = text.match(/ref(?:erence)?\.?\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9][0-9 \-]{4,20}[0-9])/i);
  if (labeled) return labeled[1].replace(/[\s-]/g, '');
  const runs = [...text.matchAll(/\d[\d \-]{9,20}\d/g)].map((m) => m[0].replace(/[\s-]/g, ''));
  return runs.length ? runs.reduce((a, b) => (b.length > a.length ? b : a)) : null;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

// "Sep 24, 2026", "24 Sep 2026", "09/24/2026", "2026-09-24" → "2026-09-24".
function findDate(text) {
  let m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (m) return iso(m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, Number(m[2]));
  m = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i);
  if (m) return iso(m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]));
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(m[1], Number(m[2]), Number(m[3]));
  m = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (m) return iso(m[3], Number(m[1]), Number(m[2])); // PH receipts print month first
  return null;
}

// A name on a "From / Sender / Sent by / Account name" line, or the line after the label.
function findSender(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:from|sender|sent by|paid by|account name)\s*[:\-]?\s*(.*)$/i);
    if (!m) continue;
    const candidate = (m[1] || lines[i + 1] || '').replace(/[+\d\s-]{7,}.*$/, '').trim();
    if (/[a-z]{2,}/i.test(candidate)) return candidate.toUpperCase();
  }
  return null;
}

function parseReceipt(text) {
  return { amount: findAmount(text), reference: findReference(text), date: findDate(text), sender: findSender(text) };
}

async function readProofFile(proofPath) {
  const { data, error } = await supabase.storage.from('proofs').download(proofPath);
  if (error || !data) throw error ?? new Error('Proof not found');
  const base64 = Buffer.from(await data.arrayBuffer()).toString('base64');
  const { text } = await extractText({ imageBase64: base64 });
  return { ...parseReceipt(text ?? ''), read: true };
}

/**
 * Reads the proof on one contribution / loan payment and saves the result.
 * Returns the reading (or null when there's no proof or OCR isn't set up).
 */
async function readAndSaveProof(table, id) {
  try {
    const { data: row, error } = await supabase.from(table).select('id, proof_url').eq('id', id).maybeSingle();
    if (error || !row?.proof_url) return null;
    if (!process.env.GOOGLE_VISION_API_KEY) return null;
    let reading;
    try {
      reading = await readProofFile(row.proof_url);
    } catch (e) {
      // Saved as unreadable so the verifier sees "couldn't read" instead of waiting on a read that won't come.
      reading = { amount: null, reference: null, date: null, sender: null, read: false, error: e.message };
    }
    await supabase.from(table).update({ proof_reading: reading, proof_read_at: new Date().toISOString() }).eq('id', id);
    return reading;
  } catch (e) {
    console.error('[proofReading]', table, id, e.message);
    return null;
  }
}

/** Fire-and-forget after a submit — the submission never waits on OCR. */
function readProofInBackground(table, id) {
  readAndSaveProof(table, id).catch(() => {});
}

module.exports = { parseReceipt, readAndSaveProof, readProofInBackground };
