'use client';

import type { FaceLandmarks } from './crop-math';

// We load @mediapipe/tasks-vision from a CDN at runtime to avoid Next.js
// trying to bundle its onnxruntime-web dependency.

const MEDIAPIPE_ESM = 'https://esm.sh/@mediapipe/tasks-vision@0.10.17';
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';

interface MpPoint { x: number; y: number; z?: number }
interface MpResult { faceLandmarks: MpPoint[][] }
interface MpLandmarker {
  detect(source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): MpResult;
}

let landmarker: MpLandmarker | null = null;

export async function getFaceLandmarker(): Promise<MpLandmarker> {
  if (landmarker) return landmarker;

  // Bypass webpack's static-import detection.
  const dynImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
  const mod = (await dynImport(MEDIAPIPE_ESM)) as {
    FilesetResolver: { forVisionTasks(path: string): Promise<unknown> };
    FaceLandmarker: { createFromOptions(vision: unknown, opts: unknown): Promise<MpLandmarker> };
  };

  const vision = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);

  landmarker = await mod.FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numFaces: 2,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  });

  return landmarker;
}

export interface DetectionResult {
  faceCount: number;
  /** Returns the primary (largest) face's landmarks in source pixels, or null. */
  primary: (FaceLandmarks & { rollDegrees: number }) | null;
}

/**
 * Detect faces in an image element or canvas.
 */
export async function detectFaces(
  source: HTMLImageElement | HTMLCanvasElement,
): Promise<DetectionResult> {
  const lm = await getFaceLandmarker();
  const result = lm.detect(source);

  const imageWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const imageHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;

  const faceCount = result.faceLandmarks?.length ?? 0;
  if (faceCount === 0) {
    return { faceCount: 0, primary: null };
  }

  // Pick the largest face by bbox area
  let largestIdx = 0;
  let largestArea = 0;
  const boxes = result.faceLandmarks.map((landmarks, i) => {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of landmarks) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = (maxX - minX) * imageWidth;
    const h = (maxY - minY) * imageHeight;
    const area = w * h;
    if (area > largestArea) {
      largestArea = area;
      largestIdx = i;
    }
    return { minX, minY, maxX, maxY, w, h };
  });

  const primaryBox = boxes[largestIdx];
  const primaryLandmarks = result.faceLandmarks[largestIdx];

  // MediaPipe FaceLandmarker has 478 landmarks. Iris centres are at:
  //   468 = left iris, 473 = right iris.
  const leftIris = primaryLandmarks[468];
  const rightIris = primaryLandmarks[473];
  const eyeXNorm = (leftIris.x + rightIris.x) / 2;
  const eyeYNorm = (leftIris.y + rightIris.y) / 2;

  // Roll angle: arctangent of the line between the two iris centres.
  // For an upright head, dy ≈ 0 and rollRad ≈ 0.
  const dy = (rightIris.y - leftIris.y) * imageHeight;
  const dx = (rightIris.x - leftIris.x) * imageWidth;
  const rollRad = Math.atan2(dy, dx);
  const rollDegrees = (rollRad * 180) / Math.PI;

  return {
    faceCount,
    primary: {
      imageWidth,
      imageHeight,
      faceBox: {
        x: primaryBox.minX * imageWidth,
        y: primaryBox.minY * imageHeight,
        width: primaryBox.w,
        height: primaryBox.h,
      },
      eyeX: eyeXNorm * imageWidth,
      eyeY: eyeYNorm * imageHeight,
      rollDegrees,
    },
  };
}

/**
 * Estimate min/max brightness of an image by sampling.
 * Used by validation rules.
 */
export function estimateBrightness(canvas: HTMLCanvasElement): { min: number; max: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { min: 128, max: 128 };
  // Sample a downscaled version for speed
  const sampleSize = 64;
  const sample = document.createElement('canvas');
  sample.width = sampleSize;
  sample.height = sampleSize;
  const sctx = sample.getContext('2d');
  if (!sctx) return { min: 128, max: 128 };
  sctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
  const data = sctx.getImageData(0, 0, sampleSize, sampleSize).data;

  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  return { min, max };
}
