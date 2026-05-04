'use client';

/**
 * HEIC / HEIF handling.
 *
 * iPhone defaults to saving photos as HEIC since iOS 11. Most non-Safari
 * browsers cannot decode HEIC — <img>, <canvas>, createImageBitmap all fail.
 * If a user uploads an iPhone photo to a non-Safari browser (e.g. Android
 * Chrome, desktop Chrome), the image silently fails to decode.
 *
 * Strategy:
 *   1. Detect HEIC by MIME type AND by magic bytes (Android often strips MIME)
 *   2. Test if the browser can decode HEIC natively (Safari can)
 *   3. If not, convert to JPEG via heic2any (loaded from CDN at runtime to
 *      avoid bundling its 1.7 MB libheif WASM into our build)
 */

const HEIC_MIME = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

/** Magic-byte sniffing — HEIC files start with `....ftypheic` or similar. */
async function sniffIsHeic(file: Blob): Promise<boolean> {
  // ftyp box at offset 4, brand at offset 8 (4 bytes), 'heic'/'heif'/'mif1'/'msf1'
  const head = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(head);
  if (bytes.length < 12) return false;
  // Bytes 4-7 should be 'ftyp'
  if (
    bytes[4] !== 0x66 || // f
    bytes[5] !== 0x74 || // t
    bytes[6] !== 0x79 || // y
    bytes[7] !== 0x70 // p
  ) {
    return false;
  }
  // Bytes 8-11 are the major brand
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ['heic', 'heix', 'heif', 'mif1', 'msf1', 'hevc', 'hevx'].includes(brand);
}

export async function isHeic(file: Blob): Promise<boolean> {
  if (HEIC_MIME.has(file.type.toLowerCase())) return true;
  // Some sources strip MIME; fall back to magic bytes
  return sniffIsHeic(file);
}

/**
 * Test whether the current browser can decode HEIC natively.
 * Returns true on Safari, generally false elsewhere.
 *
 * Memoized — the answer doesn't change across a session.
 */
let nativeHeicSupportCache: boolean | null = null;
export async function browserCanDecodeHeic(): Promise<boolean> {
  if (nativeHeicSupportCache !== null) return nativeHeicSupportCache;
  if (typeof document === 'undefined') return false;
  // Tiny HEIC sample (4 bytes 'mif1') won't actually decode; we use a
  // feature probe instead: try a 1x1 HEIC encoded as base64.
  // Pragmatic shortcut: check if the browser is Safari/iOS, otherwise false.
  // This avoids shipping a real HEIC sample.
  const ua = navigator.userAgent;
  const isSafari =
    /^((?!chrome|android|crios|fxios).)*safari/i.test(ua) || /iPhone|iPad|iPod/i.test(ua);
  nativeHeicSupportCache = isSafari;
  return isSafari;
}

/**
 * Convert a HEIC blob to a JPEG blob using heic2any (browser-only).
 * Loaded from esm.sh at runtime to keep our bundle slim.
 */
export async function convertHeicToJpeg(heic: Blob): Promise<Blob> {
  // Bypass webpack's static-import detection
  const dynImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
  const mod = (await dynImport('https://esm.sh/heic2any@0.0.4')) as {
    default: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>;
  };
  const result = await mod.default({
    blob: heic,
    toType: 'image/jpeg',
    quality: 0.92,
  });
  // heic2any may return Blob or Blob[] (multi-image HEIC); take first
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Normalize a file to a browser-decodable format.
 * If the file is HEIC and the browser can't decode it, convert to JPEG.
 * Otherwise pass through unchanged.
 */
export async function normalizeHeicIfNeeded(file: File | Blob): Promise<File | Blob> {
  if (!(await isHeic(file))) return file;
  if (await browserCanDecodeHeic()) return file;
  try {
    const jpeg = await convertHeicToJpeg(file);
    // Preserve filename if it was a File
    if (file instanceof File) {
      const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      return new File([jpeg], newName, { type: 'image/jpeg' });
    }
    return jpeg;
  } catch (err) {
    // Conversion failed — surface to caller so they can show a clear error
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(
      `Could not convert HEIC photo to JPEG (${msg}). Try uploading a JPG or PNG instead.`,
    );
  }
}

// For tests
export { sniffIsHeic };
