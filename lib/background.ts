'use client';

import type { ProviderConfig } from './providers';

/**
 * Remove the background from an image, returning a PNG Blob with transparency.
 *
 * Strict provider isolation: if the user chose 'on-device', a failure throws
 * with a clear message rather than silently falling through to a paid cloud
 * provider (which would leak the image to a service the user didn't pick).
 */
export async function removeBackground(
  input: Blob | File,
  config: ProviderConfig,
): Promise<Blob> {
  if (config.providerId === 'on-device') {
    return removeBackgroundOnDevice(input);
  }
  return removeBackgroundViaServer(input, config);
}

const IMGLY_CDN = 'https://esm.sh/@imgly/background-removal@1.5.5';

let imglyMod: { removeBackground: (input: Blob | File, opts?: unknown) => Promise<Blob> } | null = null;

async function loadImgly() {
  if (imglyMod) return imglyMod;
  // Bypass webpack's static-import detection.
  const dynImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
  imglyMod = (await dynImport(IMGLY_CDN)) as typeof imglyMod;
  return imglyMod!;
}

async function removeBackgroundOnDevice(input: Blob | File): Promise<Blob> {
  let mod: Awaited<ReturnType<typeof loadImgly>>;
  try {
    mod = await loadImgly();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(
      `Could not load on-device background remover (${msg}). Check your internet connection, or go back to step 1 and choose a cloud provider.`,
    );
  }

  // Hard timeout — protects against the imgly call hanging indefinitely
  // (which can happen if the model registry doesn't recognise the requested
  // model name, or if Safari silently aborts a large model download).
  // 90 seconds is long enough for a slow first-run download on 4G, but
  // short enough that users see an error rather than waiting forever.
  const TIMEOUT_MS = 90_000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            'On-device background removal timed out (>90s). Your network may be slow or your device may be low on memory. Go back to step 1 and choose a cloud provider.',
          ),
        ),
      TIMEOUT_MS,
    );
  });

  try {
    const removalPromise = mod.removeBackground(input, {
      // 'isnet_quint8' is the small (~40MB) quantized model. Slightly less
      // accurate than 'isnet_fp16' (~80MB) but reliably loads from the
      // imgly CDN. We tried fp16 and it caused stuck-progress bugs on
      // iPhone Safari, so we're staying on the proven-working option.
      // For higher quality, users should switch to a cloud provider via
      // the "Reprocess with cloud provider" button on the result screen.
      model: 'isnet_quint8',
      output: { format: 'image/png', quality: 0.95 },
    });
    return await Promise.race([removalPromise, timeoutPromise]);
  } catch (err) {
    // Common failure modes here:
    //  - Out of memory (low-end device)
    //  - Cryptic numeric error codes from onnxruntime-web (e.g. 98803832 = OOM)
    //  - SharedArrayBuffer unavailable without crossOriginIsolated (manageable
    //    fallback, but model itself may still OOM)
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `On-device background removal failed (${msg}). This usually means your device is low on memory. Go back to step 1 and choose a cloud provider (Replicate, Photoroom, or Remove.bg) instead.`,
    );
  }
}

async function removeBackgroundViaServer(
  input: Blob | File,
  config: ProviderConfig,
): Promise<Blob> {
  if (!config.apiKey) {
    throw new Error('No API key configured. Go back to step 1 and enter your API key.');
  }
  const fd = new FormData();
  fd.append('image', input);
  fd.append('provider', config.providerId);
  fd.append('apiKey', config.apiKey);

  const res = await fetch('/api/remove-bg', { method: 'POST', body: fd });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    // Surface the provider name in the error so the user knows which credentials to check
    throw new Error(`${config.providerId}: ${body || 'request failed'}`);
  }
  return res.blob();
}

/**
 * Composite a transparent-background image onto solid white.
 * Returns a PNG blob at the exact target pixel dimensions.
 */
export async function compositeOnWhite(
  fgImage: HTMLImageElement,
  cropRect: { x: number; y: number; width: number; height: number },
  outputWidth: number,
  outputHeight: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2D context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  const sx = Math.max(0, cropRect.x);
  const sy = Math.max(0, cropRect.y);
  const sx2 = Math.min(fgImage.naturalWidth, cropRect.x + cropRect.width);
  const sy2 = Math.min(fgImage.naturalHeight, cropRect.y + cropRect.height);
  const sw = sx2 - sx;
  const sh = sy2 - sy;

  if (sw > 0 && sh > 0) {
    const dx = ((sx - cropRect.x) / cropRect.width) * outputWidth;
    const dy = ((sy - cropRect.y) / cropRect.height) * outputHeight;
    const dw = (sw / cropRect.width) * outputWidth;
    const dh = (sh / cropRect.height) * outputHeight;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fgImage, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
    );
  });
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
