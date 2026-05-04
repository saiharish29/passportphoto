import { describe, expect, it } from 'vitest';
import { isHeic, sniffIsHeic } from './heic';

/** Build a blob whose first 12 bytes match a given ftyp brand. */
function blobWithFtypBrand(brand: string): Blob {
  const bytes = new Uint8Array(64);
  // box size (4 bytes) — irrelevant for sniff
  bytes[0] = 0x00; bytes[1] = 0x00; bytes[2] = 0x00; bytes[3] = 0x18;
  // 'ftyp' at offset 4
  bytes[4] = 0x66; bytes[5] = 0x74; bytes[6] = 0x79; bytes[7] = 0x70;
  // brand at offset 8
  for (let i = 0; i < 4; i++) bytes[8 + i] = brand.charCodeAt(i);
  return new Blob([bytes]);
}

describe('sniffIsHeic', () => {
  it('detects heic brand', async () => {
    expect(await sniffIsHeic(blobWithFtypBrand('heic'))).toBe(true);
  });

  it('detects heif brand', async () => {
    expect(await sniffIsHeic(blobWithFtypBrand('heif'))).toBe(true);
  });

  it('detects mif1 brand (still images container)', async () => {
    expect(await sniffIsHeic(blobWithFtypBrand('mif1'))).toBe(true);
  });

  it('detects msf1 brand (multi-image sequence)', async () => {
    expect(await sniffIsHeic(blobWithFtypBrand('msf1'))).toBe(true);
  });

  it('rejects mp42 (MP4)', async () => {
    expect(await sniffIsHeic(blobWithFtypBrand('mp42'))).toBe(false);
  });

  it('rejects qt (QuickTime)', async () => {
    expect(await sniffIsHeic(blobWithFtypBrand('qt  '))).toBe(false);
  });

  it('rejects a JPEG (no ftyp)', async () => {
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'J'.charCodeAt(0), 'F'.charCodeAt(0), 'I'.charCodeAt(0), 'F'.charCodeAt(0), 0, 0]);
    expect(await sniffIsHeic(new Blob([jpegHeader]))).toBe(false);
  });

  it('rejects a PNG (no ftyp)', async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(await sniffIsHeic(new Blob([pngHeader]))).toBe(false);
  });

  it('rejects truncated blobs', async () => {
    expect(await sniffIsHeic(new Blob([new Uint8Array([0xff, 0xd8])]))).toBe(false);
  });
});

describe('isHeic', () => {
  it('accepts image/heic by MIME type', async () => {
    const blob = new Blob([], { type: 'image/heic' });
    expect(await isHeic(blob)).toBe(true);
  });

  it('accepts image/heif by MIME type', async () => {
    expect(await isHeic(new Blob([], { type: 'image/heif' }))).toBe(true);
  });

  it('handles MIME case-insensitively', async () => {
    expect(await isHeic(new Blob([], { type: 'IMAGE/HEIC' }))).toBe(true);
  });

  it('falls through to magic-byte sniff when MIME is missing', async () => {
    // Empty MIME but HEIC magic bytes — Android sometimes strips MIME
    const blob = blobWithFtypBrand('heic');
    Object.defineProperty(blob, 'type', { value: '' });
    expect(await isHeic(blob)).toBe(true);
  });

  it('rejects JPEG with no MIME and no HEIC magic', async () => {
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const blob = new Blob([jpegHeader]);
    Object.defineProperty(blob, 'type', { value: '' });
    expect(await isHeic(blob)).toBe(false);
  });
});
