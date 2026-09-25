/**
 * features/signoff/proofMatch.ts
 * ----------------------------------------------------------------------------
 * "Recorded" vs "Read from proof": each field the record states, next to what
 * the server read off the uploaded proof (migration 0076). A field only counts
 * as a mismatch when both sides have a value and they differ — a field the
 * OCR couldn't find is "not on proof", for the verifier to check by eye.
 */
import type { ProofReading } from '../../api/contributions';
import { formatPeso } from '../../lib/money';

export type FieldState = 'match' | 'mismatch' | 'unread';

export interface ProofField {
  key: 'amount' | 'reference' | 'date' | 'sender';
  label: string;
  recorded: string;
  read: string;
  state: FieldState;
}

export type MatchSummary =
  | { kind: 'match'; fields: ProofField[] }
  | { kind: 'mismatch'; count: number; fields: ProofField[] }
  | { kind: 'partial'; fields: ProofField[] } // read, but nothing comparable matched or mismatched
  | { kind: 'pending' } // proof uploaded, not read yet
  | { kind: 'no_proof' };

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const words = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);

function localIsoDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function showDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  return isNaN(d.getTime()) ? isoDate : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Same day, or the receipt a day before the record (paid last night, recorded this morning). */
function sameDay(recordIso: string, readDate: string) {
  const a = new Date(`${localIsoDate(recordIso)}T00:00:00`).getTime();
  const b = new Date(`${readDate}T00:00:00`).getTime();
  const diffDays = (a - b) / 86400000;
  return diffDays >= 0 && diffDays <= 1;
}

/** Two of the payer's name parts appear on the proof (or one, for a one-word name). */
function sameName(recorded: string, read: string) {
  const r = words(recorded);
  const p = new Set(words(read));
  const hits = r.filter((w) => p.has(w)).length;
  return hits >= Math.min(2, r.length);
}

export function compareToProof(record: {
  amount: string | number | null;
  reference: string | null | undefined;
  recordedAt: string | undefined;
  payer: string;
}, reading: ProofReading | null | undefined, hasProof: boolean): MatchSummary {
  if (!hasProof) return { kind: 'no_proof' };
  if (!reading) return { kind: 'pending' };

  const field = (key: ProofField['key'], label: string, recorded: string, read: string | null, equal: () => boolean): ProofField => ({
    key, label, recorded: recorded || '—', read: read ?? 'Not on proof',
    state: !read || !recorded ? 'unread' : equal() ? 'match' : 'mismatch',
  });

  const amount = record.amount != null ? Number(record.amount) : null;
  const fields: ProofField[] = [
    field('amount', 'Amount', amount != null ? formatPeso(amount) : '', reading.amount != null ? formatPeso(reading.amount) : null,
      () => amount != null && reading.amount != null && Math.abs(amount - reading.amount) < 0.5),
    field('reference', 'Reference no.', record.reference ?? '', reading.reference,
      () => digits(record.reference) !== '' && digits(record.reference) === digits(reading.reference)),
    field('date', 'Date', record.recordedAt ? showDate(localIsoDate(record.recordedAt)) : '', reading.date ? showDate(reading.date) : null,
      () => !!record.recordedAt && !!reading.date && sameDay(record.recordedAt, reading.date)),
    field('sender', 'Paid by', record.payer.toUpperCase(), reading.sender,
      () => !!reading.sender && sameName(record.payer, reading.sender)),
  ];

  const mismatches = fields.filter((f) => f.state === 'mismatch').length;
  if (mismatches > 0) return { kind: 'mismatch', count: mismatches, fields };
  if (fields.some((f) => f.state === 'match')) return { kind: 'match', fields };
  return { kind: 'partial', fields };
}

/** The pill on a queue row. */
export function matchLabel(m: MatchSummary): { text: string; tone: 'good' | 'bad' | 'muted' } {
  switch (m.kind) {
    case 'match': return m.fields.every((f) => f.state === 'match') ? { text: 'All fields match', tone: 'good' } : { text: 'Readable fields match', tone: 'good' };
    case 'mismatch': return { text: `${m.count} field${m.count === 1 ? '' : 's'} ${m.count === 1 ? "doesn't" : "don't"} match`, tone: 'bad' };
    case 'partial': return { text: "Proof couldn't be read — check by eye", tone: 'muted' };
    case 'pending': return { text: 'Reading proof…', tone: 'muted' };
    default: return { text: 'No proof attached', tone: 'bad' };
  }
}
