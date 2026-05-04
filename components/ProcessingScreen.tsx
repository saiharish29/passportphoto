'use client';

import { useEffect, useRef, useState } from 'react';
import { detectFaces, estimateBrightness } from '@/lib/face-detect';
import { computeCrop } from '@/lib/crop-math';
import { validateImage, isAcceptable, type ValidationIssue } from '@/lib/validation';
import { removeBackground, compositeOnWhite, blobToImage } from '@/lib/background';
import { buildA4Sheet } from '@/lib/pdf-sheet';
import { PHOTO_SPECS, specPixelSize, type PhotoSpecId } from '@/lib/photo-spec';
import { PROVIDERS, type ProviderConfig } from '@/lib/providers';

interface Props {
  source: File | Blob;
  specId: PhotoSpecId;
  providerConfig: ProviderConfig;
  onDone: (png: Blob, pdf: Blob) => void;
  onError: () => void;
  onChangeProvider: () => void;
}

type Stage =
  | 'loading'
  | 'normalizing'
  | 'detecting'
  | 'invalid'
  | 'removing-bg'
  | 'compositing'
  | 'building-pdf'
  | 'done'
  | 'error';

const STAGE_LABELS: Record<Stage, string> = {
  loading: 'Loading image…',
  normalizing: 'Preparing your photo…',
  detecting: 'Finding your face…',
  invalid: 'Validation issues',
  'removing-bg': 'Removing background (this is the slow part — ~5–15s)…',
  compositing: 'Building your photo…',
  'building-pdf': 'Generating A4 print sheet…',
  done: 'Done',
  error: 'Something went wrong',
};

export function ProcessingScreen({
  source,
  specId,
  providerConfig,
  onDone,
  onError,
  onChangeProvider,
}: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runPipeline().catch((err) => {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStage('error');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPipeline() {
    const spec = PHOTO_SPECS[specId];

    // 1. Normalize: HEIC → JPEG (if needed), EXIF orientation → upright pixels
    setStage('normalizing');
    const { normalizeHeicIfNeeded } = await import('@/lib/heic');
    const { normalizeOrientation } = await import('@/lib/image-orientation');
    let normalized: File | Blob = source;
    try {
      normalized = await normalizeHeicIfNeeded(normalized);
    } catch (err) {
      // HEIC conversion failed — re-throw so the user sees a clear message
      throw err;
    }
    normalized = await normalizeOrientation(normalized);

    // 2. Load normalized source into an Image
    setStage('loading');
    const sourceImg = await blobToImage(normalized);

    // 3. Detect face
    setStage('detecting');
    const detection = await detectFaces(sourceImg);

    // Brightness check
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sourceImg.naturalWidth;
    sampleCanvas.height = sourceImg.naturalHeight;
    sampleCanvas.getContext('2d')!.drawImage(sourceImg, 0, 0);
    const brightness = estimateBrightness(sampleCanvas);

    if (!detection.primary || detection.faceCount !== 1) {
      const baseCtx = detection.primary
        ? { ...detection.primary, faceCount: detection.faceCount }
        : {
            imageWidth: sourceImg.naturalWidth,
            imageHeight: sourceImg.naturalHeight,
            faceBox: { x: 0, y: 0, width: 0, height: 0 },
            eyeX: 0,
            eyeY: 0,
            faceCount: detection.faceCount,
            rollDegrees: 0,
          };
      const v = validateImage(
        { ...baseCtx, minBrightness: brightness.min, maxBrightness: brightness.max },
        spec,
      );
      setIssues(v);
      setStage('invalid');
      return;
    }

    const validationCtx = {
      ...detection.primary,
      faceCount: detection.faceCount,
      minBrightness: brightness.min,
      maxBrightness: brightness.max,
    };
    const v = validateImage(validationCtx, spec);
    if (!isAcceptable(v)) {
      setIssues(v);
      setStage('invalid');
      return;
    }
    // Show warnings but proceed
    setIssues(v);

    // 3. Compute the crop
    const { crop } = computeCrop(detection.primary, spec);

    // 4. Remove background
    setStage('removing-bg');
    const cutout = await removeBackground(normalized, providerConfig);

    // 5. Composite on white at exact spec dimensions
    setStage('compositing');
    const cutoutImg = await blobToImage(cutout);
    const { width, height } = specPixelSize(spec);
    const finalPng = await compositeOnWhite(cutoutImg, crop, width, height);

    // 6. Build PDF
    setStage('building-pdf');
    const pdfBytes = await buildA4Sheet(new Uint8Array(await finalPng.arrayBuffer()), spec);
    const pdfBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

    setStage('done');
    onDone(finalPng, pdfBlob);
  }

  if (stage === 'invalid') {
    return (
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">We need a better photo</h2>
        <ul className="space-y-2 text-sm">
          {issues.map((iss) => (
            <li
              key={iss.code}
              className={`rounded-xl px-3 py-2 ${
                iss.severity === 'error'
                  ? 'bg-red-50 text-red-800'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              <span className="font-semibold">
                {iss.severity === 'error' ? '✕' : '⚠'}
              </span>{' '}
              {iss.message}
            </li>
          ))}
        </ul>
        <button type="button" onClick={onError} className="btn-primary w-full">
          Try again
        </button>
      </div>
    );
  }

  if (stage === 'error') {
    // Heuristic: if the error mentions background removal or step 1, show
    // a direct "Change provider" button. Otherwise just "Try again".
    const isProviderError =
      errorMsg !== null &&
      /background removal|step 1|api key|provider/i.test(errorMsg);
    return (
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-ink-700">{errorMsg}</p>
        {isProviderError && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Tip:</strong> The on-device option is free but uses lots of memory.
            For reliable results, choose a cloud provider in step 1 (most have a free tier).
          </div>
        )}
        <div className="grid gap-2">
          {isProviderError && (
            <button
              type="button"
              onClick={onChangeProvider}
              className="btn-primary w-full"
            >
              Change provider (step 1)
            </button>
          )}
          <button
            type="button"
            onClick={onError}
            className={isProviderError ? 'btn-secondary w-full' : 'btn-primary w-full'}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">Working on your photo</h2>
      <div className="flex items-center gap-3 text-sm text-ink-700">
        <Spinner />
        <span>
          {stage === 'removing-bg'
            ? `Removing background via ${PROVIDERS[providerConfig.providerId].name}…`
            : STAGE_LABELS[stage]}
        </span>
      </div>
      <ProgressDots stage={stage} />
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-900/20 border-t-ink-900"
      aria-hidden
    />
  );
}

function ProgressDots({ stage }: { stage: Stage }) {
  const order: Stage[] = ['normalizing', 'loading', 'detecting', 'removing-bg', 'compositing', 'building-pdf', 'done'];
  const idx = order.indexOf(stage);
  return (
    <div className="flex gap-1.5">
      {order.slice(0, -1).map((s, i) => (
        <span
          key={s}
          className={`h-1.5 flex-1 rounded-full ${
            i < idx ? 'bg-ink-900' : i === idx ? 'bg-saffron-500' : 'bg-ink-900/10'
          }`}
        />
      ))}
    </div>
  );
}
