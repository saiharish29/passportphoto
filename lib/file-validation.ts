/**
 * Cheap pre-pipeline validation for uploaded files. Catches obviously bad
 * files before we spin up MediaPipe + imgly (which take seconds and tens of
 * megabytes of RAM).
 */

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** 15 MB. Most phone photos are 2–8 MB; HEIC can be larger. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Minimum image dimension for a usable passport photo. */
export const MIN_IMAGE_DIMENSION = 400;

export function validateFileMeta(file: File | Blob): FileValidationResult {
  if (file.size === 0) {
    return { ok: false, error: 'The file is empty.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    };
  }
  if (file.type && !ACCEPTED_MIME.has(file.type.toLowerCase())) {
    return {
      ok: false,
      error: `Unsupported file type "${file.type}". Use JPG, PNG, WebP, or HEIC.`,
    };
  }
  return { ok: true };
}

/**
 * Read a file's intrinsic image dimensions (browser-only).
 * Returns null on decoding error.
 */
export async function readImageDimensions(
  file: File | Blob,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const result = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function validateUploadedFile(
  file: File | Blob,
): Promise<FileValidationResult> {
  const meta = validateFileMeta(file);
  if (!meta.ok) return meta;

  // HEIC files can't be decoded by <img> in non-Safari browsers, so we can't
  // measure their dimensions without first converting. Defer the dimension
  // check to after normalization in the processing pipeline.
  const { isHeic } = await import('./heic');
  if (await isHeic(file)) {
    return { ok: true };
  }

  const dims = await readImageDimensions(file);
  if (!dims) {
    return { ok: false, error: 'Could not read this image. Try a different file.' };
  }
  if (dims.width < MIN_IMAGE_DIMENSION || dims.height < MIN_IMAGE_DIMENSION) {
    return {
      ok: false,
      error: `Image is too small (${dims.width}×${dims.height} px). Minimum ${MIN_IMAGE_DIMENSION}×${MIN_IMAGE_DIMENSION} px.`,
    };
  }
  return { ok: true };
}
