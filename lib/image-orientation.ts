'use client';

/**
 * EXIF orientation handling.
 *
 * Modern phones write photos with the sensor's native orientation in pixels
 * and an EXIF Orientation tag (1-8) saying how the image should be rotated
 * for display.
 *
 * Browser support for auto-rotating is inconsistent:
 *   - Chrome 81+ and Firefox 26+ auto-rotate <img> elements via image-orientation: from-image (CSS default)
 *   - Canvas drawImage(): respects orientation in modern Chrome/Firefox; broken on older browsers
 *   - createImageBitmap with imageOrientation: 'from-image' is the most reliable modern path
 *
 * For face detection and cropping we need PIXELS in the upright orientation,
 * not just visual presentation. So we always normalize to upright pixels.
 *
 * EXIF Orientation values (TIFF spec):
 *   1 = Normal (no rotation)
 *   2 = Mirrored horizontal
 *   3 = Rotated 180°
 *   4 = Mirrored vertical
 *   5 = Mirrored horizontal + rotated 90° CW
 *   6 = Rotated 90° CW
 *   7 = Mirrored horizontal + rotated 90° CCW
 *   8 = Rotated 90° CCW
 */

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Read the EXIF Orientation tag from a JPEG blob.
 * Returns 1 (Normal) if the file isn't a JPEG, has no EXIF, or anything fails.
 *
 * Pure parser — no dependencies. Reads at most the first 64 KB of the file.
 */
export async function readExifOrientation(blob: Blob): Promise<ExifOrientation> {
  try {
    const head = await blob.slice(0, 65536).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 4) return 1;

    // JPEG magic
    if (view.getUint16(0) !== 0xffd8) return 1;

    let offset = 2;
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset);
      offset += 2;
      // SOI (0xffd8) and EOI (0xffd9) have no length
      if (marker === 0xffd8 || marker === 0xffd9) continue;
      // Out of range
      if ((marker & 0xff00) !== 0xff00) break;

      const segLen = view.getUint16(offset);
      // APP1 = 0xffe1 (where EXIF lives)
      if (marker === 0xffe1) {
        // EXIF header: 'Exif\0\0'
        if (offset + 8 >= view.byteLength) return 1;
        if (
          view.getUint32(offset + 2) !== 0x45786966 || // 'Exif'
          view.getUint16(offset + 6) !== 0x0000
        ) {
          offset += segLen;
          continue;
        }
        // TIFF header at offset+8 — endianness then magic 0x002A
        const tiffOffset = offset + 8;
        const endian = view.getUint16(tiffOffset);
        const little = endian === 0x4949;
        if (!little && endian !== 0x4d4d) return 1;
        if (view.getUint16(tiffOffset + 2, little) !== 0x002a) return 1;
        // First IFD offset (relative to tiffOffset)
        const ifdStart = tiffOffset + view.getUint32(tiffOffset + 4, little);
        const numEntries = view.getUint16(ifdStart, little);
        for (let i = 0; i < numEntries; i++) {
          const entryOffset = ifdStart + 2 + i * 12;
          if (entryOffset + 8 >= view.byteLength) break;
          const tag = view.getUint16(entryOffset, little);
          if (tag === 0x0112) {
            // Orientation tag: SHORT (2 bytes), count=1, value at +8
            const orient = view.getUint16(entryOffset + 8, little);
            if (orient >= 1 && orient <= 8) return orient as ExifOrientation;
            return 1;
          }
        }
        return 1;
      }
      offset += segLen;
    }
    return 1;
  } catch {
    return 1;
  }
}

/**
 * Apply an EXIF orientation to an image element / bitmap, returning a canvas
 * with pixels in upright orientation.
 */
export function applyOrientation(
  source: HTMLImageElement | ImageBitmap,
  orientation: ExifOrientation,
): HTMLCanvasElement {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;

  const canvas = document.createElement('canvas');
  // Orientations 5–8 swap width and height
  if (orientation >= 5) {
    canvas.width = h;
    canvas.height = w;
  } else {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  switch (orientation) {
    case 1:
      ctx.transform(1, 0, 0, 1, 0, 0);
      break;
    case 2:
      ctx.transform(-1, 0, 0, 1, w, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, w, h);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, h);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, h, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, h, w);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, w);
      break;
  }
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Normalize a blob to a JPEG with upright pixel orientation.
 * Returns the original blob if no rotation is needed.
 */
export async function normalizeOrientation(blob: Blob): Promise<Blob> {
  const orientation = await readExifOrientation(blob);
  if (orientation === 1) return blob;

  // Decode the image
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to decode image for orientation'));
      i.src = url;
    });
    const canvas = applyOrientation(img, orientation);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        0.95,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
