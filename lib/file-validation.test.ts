import { describe, expect, it } from 'vitest';
import { validateFileMeta, MAX_FILE_BYTES } from './file-validation';

/** Build a fake Blob-like object with controlled size and type. */
function fakeFile(size: number, type: string): Blob {
  const blob = new Blob([new Uint8Array(Math.min(size, 1024))], { type });
  // Override size to simulate large files without allocating memory
  Object.defineProperty(blob, 'size', { value: size, configurable: true });
  return blob;
}

describe('validateFileMeta', () => {
  it('accepts a normal JPEG', () => {
    expect(validateFileMeta(fakeFile(2_000_000, 'image/jpeg'))).toEqual({ ok: true });
  });

  it('accepts a normal PNG', () => {
    expect(validateFileMeta(fakeFile(3_000_000, 'image/png'))).toEqual({ ok: true });
  });

  it('accepts WebP and HEIC', () => {
    expect(validateFileMeta(fakeFile(1_000_000, 'image/webp')).ok).toBe(true);
    expect(validateFileMeta(fakeFile(5_000_000, 'image/heic')).ok).toBe(true);
  });

  it('rejects empty files', () => {
    const result = validateFileMeta(fakeFile(0, 'image/jpeg'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects files larger than the size cap', () => {
    const result = validateFileMeta(fakeFile(MAX_FILE_BYTES + 1, 'image/jpeg'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('too large');
  });

  it('accepts files exactly at the size cap', () => {
    expect(validateFileMeta(fakeFile(MAX_FILE_BYTES, 'image/jpeg')).ok).toBe(true);
  });

  it('rejects unsupported MIME types', () => {
    const result = validateFileMeta(fakeFile(1_000_000, 'application/pdf'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unsupported');
  });

  it('rejects video files', () => {
    expect(validateFileMeta(fakeFile(1_000_000, 'video/mp4')).ok).toBe(false);
  });

  it('accepts files with no MIME type (some camera apps omit it)', () => {
    // We can't reject these blindly — picking from gallery on Android sometimes
    // produces files with type="". Fall through to dimension check.
    expect(validateFileMeta(fakeFile(1_000_000, '')).ok).toBe(true);
  });

  it('handles MIME case-insensitively', () => {
    expect(validateFileMeta(fakeFile(1_000_000, 'IMAGE/JPEG')).ok).toBe(true);
  });
});
