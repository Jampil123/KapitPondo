/**
 * features/reporting/groupLedgerPdf.ts
 * ----------------------------------------------------------------------------
 * The Group Ledger as a PDF statement — laid out like an e-wallet transaction
 * history (date/time, description, reference, debit, credit, running balance,
 * opening "STARTING BALANCE" row), in KapitPondo's steel palette.
 *
 * Built with pdf-lib (pure JS — no native module, so no dev-client rebuild,
 * unlike expo-print). Standard PDF fonts only cover Latin-1/WinAnsi, so the
 * peso sign isn't drawn: amounts are plain numbers under "(PHP)" headers, and
 * any other character outside that set is replaced (see safe()).
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type * as PdfLib from 'pdf-lib';
import { entryRef, type LedgerEntry } from '@/api/ledger';

/**
 * pdf-lib, loaded on first export only — from its self-contained UMD bundle,
 * not the package's ESM entry: that one imports tslib as an ES module, which
 * Metro (web) resolves to an undefined default and crashes at load
 * ("Cannot destructure property '__extends' of 'tslib.default'").
 */
let pdfLib: typeof PdfLib | null = null;
function loadPdfLib(): typeof PdfLib {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!pdfLib) pdfLib = require('pdf-lib/dist/pdf-lib.min.js') as typeof PdfLib;
  return pdfLib;
}

function palette() {
  const { rgb } = loadPdfLib();
  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  return {
    ink: hex('#2A3E4B'),
    brand: hex('#5E8497'),
    brandSoft: hex('#EAF2F6'),
    rule: hex('#D6E6EF'),
    muted: hex('#6E6E6E'),
    credit: hex('#1E7A4F'),
    white: rgb(1, 1, 1),
  };
}
let C: ReturnType<typeof palette>;

// A4 portrait, points.
const W = 595.28;
const H = 841.89;
const M = 36;
const ROW = 15;
const FS = 7.4;

// Column layout — x offsets from the left margin, widths sum to W - 2M.
const COLS = [
  { key: 'date', label: 'Date and Time', w: 78, align: 'left' as const },
  { key: 'desc', label: 'Description', w: 182, align: 'left' as const },
  { key: 'ref', label: 'Reference No.', w: 62, align: 'left' as const },
  { key: 'debit', label: 'Debit (PHP)', w: 66, align: 'right' as const },
  { key: 'credit', label: 'Credit (PHP)', w: 66, align: 'right' as const },
  { key: 'bal', label: 'Balance (PHP)', w: 69.28, align: 'right' as const },
];

const TYPE_LABEL: Record<string, string> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan released',
  loan_repayment: 'Loan repayment',
  distribution: 'Year-end share',
  expense: 'Expense',
  penalty: 'Late penalty',
  fee: 'Fee',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
  withdrawal: 'Withdrawal payout',
};

// WinAnsi extras beyond Latin-1 that the standard fonts can draw.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function safe(s: string): string {
  return s
    .replace(/₱/g, 'PHP ')
    .replace(/[−‒]/g, '-')
    .split('')
    .map((ch) => (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(ch) ? ch : '?'))
    .join('')
    .replace(/[\u0000-\u001f]/g, ' ');
}

const num = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n: number) => String(n).padStart(2, '0');
function stamp(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Trim text with "..." so it fits `max` points wide. */
function fit(text: string, font: PDFFont, size: number, max: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function cell(page: PDFPage, text: string, x: number, w: number, y: number, font: PDFFont, color: ReturnType<typeof palette>['ink'], align: 'left' | 'right' | 'center' = 'left', size = FS) {
  const t = fit(text, font, size, w - 8);
  const tw = font.widthOfTextAtSize(t, size);
  const tx = align === 'right' ? x + w - 4 - tw : align === 'center' ? x + (w - tw) / 2 : x + 4;
  page.drawText(t, { x: tx, y, size, font, color });
}

export interface LedgerPdfRow { e: LedgerEntry; balance: number }

/**
 * `rows` newest first, each with the group's cash balance right after it
 * (exactly what the Group Ledger screen computes).
 */
export async function buildGroupLedgerPdf({ groupName, rows }: { groupName: string; rows: LedgerPdfRow[] }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = loadPdfLib();
  C = palette();
  const doc = await PDFDocument.create();
  doc.setTitle(`${safe(groupName)} - Group Ledger`);
  doc.setCreator('KapitPondo');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const chrono = [...rows].reverse(); // oldest first, like a bank statement
  const first = chrono[0];
  const effect = (e: LedgerEntry) => (e.direction === 'credit' ? 1 : -1) * Number(e.amount);
  const opening = first ? first.balance - effect(first.e) : 0;
  const from = first ? new Date(first.e.posted_at) : new Date();
  const to = chrono.length ? new Date(chrono[chrono.length - 1].e.posted_at) : new Date();
  const totalIn = chrono.reduce((s, r) => s + (r.e.direction === 'credit' ? Number(r.e.amount) : 0), 0);
  const totalOut = chrono.reduce((s, r) => s + (r.e.direction === 'credit' ? 0 : Number(r.e.amount)), 0);
  const closing = rows[0]?.balance ?? opening;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  let zebra = 0;

  const header = (firstPage: boolean) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
    if (firstPage) {
      // Title block.
      const title = 'KapitPondo Group Ledger';
      page.drawText(title, { x: (W - bold.widthOfTextAtSize(title, 20)) / 2, y: y - 18, size: 20, font: bold, color: C.brand });
      const g = fit(groupName, bold, 11, W - 2 * M);
      page.drawText(g, { x: (W - bold.widthOfTextAtSize(g, 11)) / 2, y: y - 36, size: 11, font: bold, color: C.ink });
      const range = `${dayStr(from)} to ${dayStr(to)}`;
      page.drawText(range, { x: (W - regular.widthOfTextAtSize(range, 9.5)) / 2, y: y - 51, size: 9.5, font: regular, color: C.muted });
      y -= 70;

      // Summary strip.
      const boxes = [
        ['Starting balance', num(opening)],
        ['Money in', num(totalIn)],
        ['Money out', num(totalOut)],
        ['Ending balance', num(closing)],
      ];
      const bw = (W - 2 * M - 3 * 8) / 4;
      boxes.forEach(([label, value], i) => {
        const bx = M + i * (bw + 8);
        page.drawRectangle({ x: bx, y: y - 36, width: bw, height: 36, color: C.brandSoft });
        page.drawText(label.toUpperCase(), { x: bx + 8, y: y - 13, size: 6.5, font: bold, color: C.muted });
        page.drawText(value, { x: bx + 8, y: y - 28, size: 10.5, font: bold, color: C.ink });
      });
      y -= 50;
    } else {
      const t = fit(`${groupName} - Group Ledger (continued)`, bold, 9, W - 2 * M);
      page.drawText(t, { x: M, y: y - 9, size: 9, font: bold, color: C.brand });
      y -= 20;
    }

    // Column header row.
    page.drawRectangle({ x: M, y: y - ROW, width: W - 2 * M, height: ROW, color: C.brand });
    let x = M;
    for (const c of COLS) {
      cell(page, c.label, x, c.w, y - ROW + 4.6, bold, C.white, c.align === 'right' ? 'right' : 'left', 7.2);
      x += c.w;
    }
    y -= ROW;
  };

  const ensureRoom = () => {
    if (y - ROW < M + 24) header(false);
  };

  const drawRow = (vals: Record<string, string>, opts: { bold?: boolean; tint?: boolean; creditColor?: boolean } = {}) => {
    ensureRoom();
    if (opts.tint || zebra++ % 2 === 1) page.drawRectangle({ x: M, y: y - ROW, width: W - 2 * M, height: ROW, color: C.brandSoft });
    page.drawLine({ start: { x: M, y: y - ROW }, end: { x: W - M, y: y - ROW }, thickness: 0.4, color: C.rule });
    let x = M;
    for (const c of COLS) {
      const v = vals[c.key] ?? '';
      const color = opts.creditColor && c.key === 'credit' && v ? C.credit : C.ink;
      cell(page, v, x, c.w, y - ROW + 4.8, opts.bold ? bold : regular, color, c.align);
      x += c.w;
    }
    y -= ROW;
  };

  header(true);
  drawRow({ desc: 'STARTING BALANCE', bal: num(opening) }, { bold: true, tint: true });
  zebra = 0;
  for (const { e, balance } of chrono) {
    const who = e.membership?.members?.full_name ?? (e.entry_type === 'expense' ? 'Group' : '');
    const desc = [TYPE_LABEL[e.entry_type] ?? e.entry_type, who].filter(Boolean).join(' - ');
    const credit = e.direction === 'credit';
    drawRow({
      date: stamp(e.posted_at),
      desc,
      ref: entryRef(e),
      debit: credit ? '' : num(Number(e.amount)),
      credit: credit ? num(Number(e.amount)) : '',
      bal: num(balance),
    }, { creditColor: true });
  }
  drawRow({ desc: 'ENDING BALANCE', debit: num(totalOut), credit: num(totalIn), bal: num(closing) }, { bold: true, tint: true });

  // Footer on every page.
  const generated = `Generated ${stamp(new Date().toISOString())} by KapitPondo`;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 4 }, end: { x: W - M, y: M - 4 }, thickness: 0.5, color: C.rule });
    p.drawText(generated, { x: M, y: M - 16, size: 7, font: regular, color: C.muted });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: W - M - regular.widthOfTextAtSize(pg, 7), y: M - 16, size: 7, font: regular, color: C.muted });
  });

  return doc.save();
}

/** Saves the PDF and opens the share sheet (a download on the web). */
export async function shareGroupLedgerPdf(groupName: string, rows: LedgerPdfRow[]) {
  const bytes = await buildGroupLedgerPdf({ groupName, rows });
  const filename = `${groupName.replace(/[^\w-]+/g, '-').replace(/-+/g, '-')}-group-ledger-${dayStr(new Date())}.pdf`;

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
}
