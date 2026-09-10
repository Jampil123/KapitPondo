/**
 * lib/blurDetection.ts
 * ----------------------------------------------------------------------------
 * On-device sharpness check for a captured/picked photo (used by
 * identity-capture.tsx before accepting an ID shot). No native CV module is
 * installed, so this is a pure-JS heuristic: downscale to a small JPEG via
 * expo-image-manipulator, decode it with jpeg-js, and score sharpness as the
 * variance of a 3x3 Laplacian over the grayscale image — the standard
 * "blur = low high-frequency variance" proxy. BLUR_VARIANCE_THRESHOLD is a
 * rough calibration for the SCAN_WIDTH used here; tune it against real
 * device photos if it starts flagging too eagerly or too leniently.
 *
 * Deps: expo-image-manipulator (npx expo install expo-image-manipulator),
 * jpeg-js (npm i jpeg-js), base64-arraybuffer (already used by lib/upload.ts).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import * as jpeg from 'jpeg-js';

const SCAN_WIDTH = 200;
const BLUR_VARIANCE_THRESHOLD = 25;

export type BlurScanResult = { blurry: boolean; score: number };

export async function scanForBlur(uri: string): Promise<BlurScanResult> {
  try {
    const rendered = await ImageManipulator.manipulate(uri).resize({ width: SCAN_WIDTH }).renderAsync();
    const saved = await rendered.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
    if (!saved.base64) return { blurry: false, score: -1 };

    const raw = jpeg.decode(decodeBase64(saved.base64), { useTArray: true });
    const score = laplacianVariance(raw.data, raw.width, raw.height);
    return { blurry: score < BLUR_VARIANCE_THRESHOLD, score };
  } catch {
    // Scoring is advisory — if decoding fails for any reason, don't block submission over it.
    return { blurry: false, score: -1 };
  }
}

function laplacianVariance(rgba: Uint8Array, width: number, height: number): number {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    gray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - width] + gray[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}
