/**
 * lib/simplePdf.ts
 * ----------------------------------------------------------------------------
 * A plain, readable report PDF: title, period line, then headings, label/value
 * lists and tables (cells wrap, header row repeats on each page). Used by the
 * Reports → Export screen for the Financial and Audit reports.
 *
 * pdf-lib (pure JS, no native module). Standard fonts only cover WinAnsi, so
 * "₱" becomes "PHP " and anything else outside that set becomes "?".
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type * as PdfLib from 'pdf-lib';

/** UMD bundle on purpose — the ESM entry breaks Metro web (see groupLedgerPdf.ts). */
let pdfLib: typeof PdfLib | null = null;
function lib(): typeof PdfLib {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!pdfLib) pdfLib = require('pdf-lib/dist/pdf-lib.min.js') as typeof PdfLib;
  return pdfLib;
}

export type PdfBlock =
  | { kind: 'heading'; text: string; count?: number }
  | { kind: 'pairs'; rows: { label: string; value: string; bold?: boolean }[] }
  | { kind: 'table'; head: string[]; rows: string[][]; widths?: number[]; align?: ('left' | 'right')[]; empty?: string }
  | { kind: 'note'; text: string };

export interface SimplePdf {
  title: string;
  subtitle?: string;
  meta?: string[];
  blocks: PdfBlock[];
}

const W = 595.28;
const H = 841.89;
const M = 40;
const CW = W - 2 * M;
const FS = 8.5;
const LH = 11;
const PAD = 4;

const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function pdfSafe(s: string): string {
  return String(s)
    .replace(/₱\s?/g, 'PHP ')
    .replace(/[−‒]/g, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .split('')
    .map((ch) => (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(ch) ? ch : '?'))
    .join('')
    .replace(/[\u0000-\u001f]/g, ' ');
}

/** Word-wraps `text` into lines no wider than `max` points. */
function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const words = pdfSafe(text).split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  const width = (t: string) => font.widthOfTextAtSize(t, size);
  for (let word of words) {
    // Break words that are longer than a whole line.
    while (width(word) > max) {
      let i = word.length - 1;
      while (i > 1 && width(word.slice(0, i)) > max) i--;
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, i));
      word = word.slice(i);
    }
    const next = line ? `${line} ${word}` : word;
    if (width(next) <= max) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildSimplePdf({ title, subtitle, meta = [], blocks }: SimplePdf): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = lib();
  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const C = { ink: hex('#2A3E4B'), brand: hex('#5E8497'), soft: hex('#F1F6F9'), rule: hex('#DCE6EC'), muted: hex('#7A7A7A') };

  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(subtitle ? `${title} - ${subtitle}` : title));
  doc.setCreator('KapitPondo');
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  let repeatHead: (() => void) | null = null;

  const text = (t: string, x: number, yy: number, size: number, font: PDFFont, color = C.ink) =>
    page.drawText(pdfSafe(t), { x, y: yy, size, font, color });

  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
    if (pages.length > 1) {
      text(pdfSafe(subtitle ? `${title} - ${subtitle}` : title), M, y - 8, 8, reg, C.muted);
      y -= 22;
    }
  };
  /** Starts a new page if `h` points don't fit; repeats the current table header. */
  const room = (h: number) => {
    if (y - h < M + 20) {
      newPage();
      repeatHead?.();
    }
  };

  // Title block.
  newPage();
  text(title, M, y - 18, 18, bold, C.brand);
  y -= 24;
  if (subtitle) { text(subtitle, M, y - 12, 12, bold); y -= 18; }
  for (const m of meta) { text(m, M, y - 9, 9, reg, C.muted); y -= 13; }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: C.brand });
  y -= 8;

  for (const b of blocks) {
    if (b.kind === 'heading') {
      repeatHead = null;
      room(40);
      y -= 12;
      const label = b.count == null ? b.text : `${b.text} (${b.count})`;
      text(label.toUpperCase(), M, y - 10, 9.5, bold, C.brand);
      y -= 18;
    } else if (b.kind === 'note') {
      for (const line of wrap(b.text, reg, 8, CW)) {
        room(LH);
        text(line, M, y - 8, 8, reg, C.muted);
        y -= LH;
      }
      y -= 4;
    } else if (b.kind === 'pairs') {
      for (const r of b.rows) {
        room(LH + 2 * PAD);
        const f = r.bold ? bold : reg;
        text(r.label, M + PAD, y - PAD - 8, FS, f, r.bold ? C.ink : C.muted);
        const v = pdfSafe(r.value);
        text(v, W - M - PAD - f.widthOfTextAtSize(v, FS), y - PAD - 8, FS, f);
        y -= LH + 2 * PAD;
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: C.rule });
      }
    } else {
      const n = b.head.length;
      const weights = b.widths ?? b.head.map(() => 1);
      const sum = weights.reduce((s, w) => s + w, 0);
      const ws = weights.map((w) => (w / sum) * CW);
      const align = b.align ?? [];

      const drawRow = (cells: string[], font: PDFFont, fill?: ReturnType<typeof hex>) => {
        const lines = cells.map((c, i) => wrap(c ?? '', font, FS, ws[i] - 2 * PAD));
        const h = Math.max(...lines.map((l) => l.length)) * LH + 2 * PAD;
        room(h);
        if (fill) page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: fill });
        let x = M;
        lines.forEach((ls, i) => {
          ls.forEach((l, j) => {
            const tx = align[i] === 'right' ? x + ws[i] - PAD - font.widthOfTextAtSize(l, FS) : x + PAD;
            page.drawText(l, { x: tx, y: y - PAD - 8 - j * LH, size: FS, font, color: C.ink });
          });
          x += ws[i];
        });
        y -= h;
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: C.rule });
      };

      repeatHead = null;
      room(2 * (LH + 2 * PAD));
      const head = () => drawRow(b.head, bold, C.soft);
      head();
      repeatHead = head;
      if (!b.rows.length) {
        repeatHead = null;
        room(LH + 2 * PAD);
        text(b.empty ?? 'None in this period.', M + PAD, y - PAD - 8, FS, reg, C.muted);
        y -= LH + 2 * PAD;
      }
      for (const r of b.rows) drawRow(Array.from({ length: n }, (_, i) => r[i] ?? ''), reg);
      repeatHead = null;
    }
  }

  const generated = `Generated ${new Date().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} by KapitPondo`;
  pages.forEach((p, i) => {
    p.drawText(pdfSafe(generated), { x: M, y: M - 14, size: 7, font: reg, color: C.muted });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: W - M - reg.widthOfTextAtSize(pg, 7), y: M - 14, size: 7, font: reg, color: C.muted });
  });

  return doc.save();
}

/** Saves the PDF and opens the share sheet (a download on the web). */
export async function sharePdf(filename: string, bytes: Uint8Array): Promise<void> {
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

export const pdfFilename = (s: string) => `${s.replace(/[^\w-]+/g, '-').replace(/-+/g, '-')}.pdf`;
