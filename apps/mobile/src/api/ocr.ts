/**
 * api/ocr.ts
 * ----------------------------------------------------------------------------
 * Plain OCR text extraction (Google Cloud Vision) — services/api/src/modules/ocr.
 * This only reads text out of an image; it never interprets what the text
 * means. The caller (see lib/receiptOcr.ts) pattern-matches the fields it
 * needs out of the raw text itself — deliberately no AI in this path.
 */
import { api } from './client';

export interface OcrTextBlock {
  text: string;
  /** Google Vision's own per-block confidence (0–1), or null if not reported. */
  confidence: number | null;
}

export interface OcrResult {
  text: string;
  blocks: OcrTextBlock[];
}

/**
 * POST /api/ocr/extract-text — reads an image (receipt, ID, form) and
 * returns the raw text Vision recognized in it. A full-resolution camera
 * photo takes noticeably longer than the client's normal default timeout.
 */
export function extractText(imageBase64: string, mediaType: string) {
  return api.post<OcrResult>('/api/ocr/extract-text', { image_base64: imageBase64, media_type: mediaType }, { timeoutMs: 30_000 });
}
