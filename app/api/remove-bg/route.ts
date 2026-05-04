import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/remove-bg
 *
 * Body: multipart/form-data with fields:
 *   - image: File (required)
 *   - provider: 'replicate' | 'photoroom' | 'removebg' (required)
 *   - apiKey: string (required) — user-supplied, NEVER persisted on the server
 *
 * Returns: PNG blob with transparent background.
 *
 * Security model: this is a thin proxy. The user's API key flows through the
 * server in the request body, is used immediately to call the chosen provider,
 * and is discarded when the request ends. No logging of the key. No storage.
 *
 * We do server-side proxying (rather than calling the provider directly from
 * the browser) for two reasons:
 *   1. CORS — most providers reject browser-origin requests.
 *   2. Some providers' SDKs are Node-only (e.g. Replicate's official client).
 */
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new NextResponse('Invalid form data', { status: 400 });
  }

  const file = formData.get('image');
  const provider = formData.get('provider');
  const apiKey = formData.get('apiKey');

  if (!(file instanceof Blob)) {
    return new NextResponse('Missing image field', { status: 400 });
  }
  if (typeof provider !== 'string') {
    return new NextResponse('Missing provider field', { status: 400 });
  }
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return new NextResponse('Missing apiKey field', { status: 400 });
  }

  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return new NextResponse('Image too large (max 15MB)', { status: 413 });
  }

  try {
    let pngBytes: ArrayBuffer;
    switch (provider) {
      case 'replicate':
        pngBytes = await runReplicate(file, apiKey.trim());
        break;
      case 'photoroom':
        pngBytes = await runPhotoroom(file, apiKey.trim());
        break;
      case 'removebg':
        pngBytes = await runRemoveBg(file, apiKey.trim());
        break;
      default:
        return new NextResponse(`Unknown provider: ${provider}`, { status: 400 });
    }

    return new NextResponse(pngBytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // Avoid echoing the API key in any error path.
    const safe = message.replace(/r8_[A-Za-z0-9]+/g, 'r8_***');
    return new NextResponse(`Background removal failed: ${safe}`, { status: 500 });
  }
}

// ---------- Provider adapters ----------

async function runReplicate(file: Blob, token: string): Promise<ArrayBuffer> {
  // Dynamic import: keeps Replicate SDK out of the route's cold-start path
  // for users on other providers.
  const { default: Replicate } = await import('replicate');
  const replicate = new Replicate({ auth: token });

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type || 'image/jpeg'};base64,${buffer.toString('base64')}`;

  // 851-labs/background-remover (BiRefNet wrapper)
  const output = await replicate.run(
    '851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc',
    { input: { image: dataUrl, format: 'png', background_type: 'rgba' } },
  );

  let imageUrl: string;
  if (typeof output === 'string') {
    imageUrl = output;
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    imageUrl = output[0];
  } else if (output && typeof (output as { url?: () => URL }).url === 'function') {
    imageUrl = (output as { url: () => URL }).url().toString();
  } else {
    throw new Error('Unexpected Replicate response shape');
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch processed image: ${imgRes.status}`);
  return imgRes.arrayBuffer();
}

async function runPhotoroom(file: Blob, key: string): Promise<ArrayBuffer> {
  const fd = new FormData();
  fd.append('image_file', file, 'photo.jpg');
  fd.append('format', 'png');

  const res = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': key },
    body: fd,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Photoroom ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

async function runRemoveBg(file: Blob, key: string): Promise<ArrayBuffer> {
  const fd = new FormData();
  fd.append('image_file', file, 'photo.jpg');
  fd.append('size', 'auto');
  fd.append('format', 'png');

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key },
    body: fd,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Remove.bg ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}
