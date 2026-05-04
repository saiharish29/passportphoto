import { describe, expect, it } from 'vitest';
import { readExifOrientation } from './image-orientation';

/**
 * Build a minimal JPEG-like blob with an APP1 EXIF segment carrying a single
 * Orientation tag with the given value. Sufficient for parser unit tests —
 * the rest of the JPEG body isn't decoded by readExifOrientation.
 */
function makeJpegWithOrientation(orientation: number, little = true): Blob {
  // Layout:
  //   FF D8                 SOI
  //   FF E1 [seglen u16]    APP1 marker + segment length
  //     "Exif\0\0"          EXIF header (6 bytes)
  //     [TIFF header 8 bytes]
  //     [IFD0: count u16=1, then 12-byte Orientation entry, then next-IFD u32=0]

  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe1]);

  // Build TIFF + IFD0
  const tiff = new ArrayBuffer(8 + 2 + 12 + 4); // header + count + 1 entry + nextIFD
  const v = new DataView(tiff);
  if (little) {
    v.setUint16(0, 0x4949); // "II"
  } else {
    v.setUint16(0, 0x4d4d); // "MM"
  }
  v.setUint16(2, 0x002a, little); // magic
  v.setUint32(4, 8, little); // first IFD offset (relative to TIFF start)
  v.setUint16(8, 1, little); // entry count
  v.setUint16(10, 0x0112, little); // tag = Orientation
  v.setUint16(12, 3, little); // type = SHORT
  v.setUint32(14, 1, little); // count = 1
  v.setUint16(18, orientation, little); // value (low 2 bytes of value field)
  v.setUint16(20, 0, little); // padding
  v.setUint32(22, 0, little); // next IFD = 0

  const exifIdent = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  const tiffArr = new Uint8Array(tiff);
  // Segment length: includes its own 2 bytes + EXIF ident + TIFF
  const segLen = 2 + exifIdent.length + tiffArr.length;
  const segLenBytes = new Uint8Array([(segLen >> 8) & 0xff, segLen & 0xff]);

  // Add some dummy JPEG body after to look more realistic
  const dummy = new Uint8Array([0xff, 0xd9]); // EOI

  return new Blob([header, segLenBytes, exifIdent, tiffArr, dummy]);
}

describe('readExifOrientation', () => {
  it('returns 1 for non-JPEG blobs', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]);
    expect(await readExifOrientation(png)).toBe(1);
  });

  it('returns 1 for empty blob', async () => {
    expect(await readExifOrientation(new Blob([]))).toBe(1);
  });

  it('returns 1 for a JPEG with no EXIF segment', async () => {
    // SOI then EOI immediately
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]);
    expect(await readExifOrientation(blob)).toBe(1);
  });

  it('reads Orientation 1 (Normal)', async () => {
    expect(await readExifOrientation(makeJpegWithOrientation(1))).toBe(1);
  });

  it('reads Orientation 3 (rotated 180°)', async () => {
    expect(await readExifOrientation(makeJpegWithOrientation(3))).toBe(3);
  });

  it('reads Orientation 6 (rotated 90° CW — common for portrait phone shots)', async () => {
    expect(await readExifOrientation(makeJpegWithOrientation(6))).toBe(6);
  });

  it('reads Orientation 8 (rotated 90° CCW)', async () => {
    expect(await readExifOrientation(makeJpegWithOrientation(8))).toBe(8);
  });

  it('reads Orientation in big-endian (Motorola) byte order', async () => {
    expect(await readExifOrientation(makeJpegWithOrientation(6, false))).toBe(6);
  });

  it('returns 1 for out-of-range orientation values', async () => {
    expect(await readExifOrientation(makeJpegWithOrientation(99))).toBe(1);
  });

  it('returns 1 for invalid orientation 0', async () => {
    expect(await readExifOrientation(makeJpegWithOrientation(0))).toBe(1);
  });
});
