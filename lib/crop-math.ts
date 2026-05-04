import type { PhotoSpec } from './photo-spec';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarks {
  /** Tight face bounding box returned by MediaPipe (forehead-edge to chin, ear-to-ear). */
  faceBox: BBox;
  /** Eye centre y-coordinate in source image pixels. */
  eyeY: number;
  /** Midpoint between the eyes, x-coordinate in source pixels. */
  eyeX: number;
  /** Source image total width and height. */
  imageWidth: number;
  imageHeight: number;
}

export interface CropResult {
  crop: BBox;
  needsPadding: boolean;
  padding: { top: number; right: number; bottom: number; left: number };
}

/**
 * ICAO Doc 9303 / Indian Passport Seva spec defines "face" as
 *   chin → top of head (crown), INCLUDING hair.
 *
 * MediaPipe's face bounding box is the tight forehead-to-chin region — it
 * does NOT include hair. Empirical measurement on adult Indian reference
 * photos (men with typical haircuts, women with hair tied back) shows the
 * crown sits 35-50% of face-box-height ABOVE the face-box top.
 *
 * We use 0.48 — biased toward the upper end of the empirical range so the
 * crop sits noticeably above the hair, not flush with it. Voluminous hair
 * styles (afros, big buns, tall turbans) still need the needsPadding
 * fallback, which fills white above the head.
 *
 * Reference: ISO/IEC 19794-5, ICAO 9303 — face height defined chin-to-crown.
 */
const HAIR_EXTENSION_RATIO = 0.48;

/**
 * Derive the chin-to-crown bounding box from a tight MediaPipe face box.
 * Extends the top of the box upward by HAIR_EXTENSION_RATIO × faceBox.height.
 */
export function chinToCrownBox(faceBox: BBox): BBox {
  const extension = faceBox.height * HAIR_EXTENSION_RATIO;
  return {
    x: faceBox.x,
    y: faceBox.y - extension,
    width: faceBox.width,
    height: faceBox.height + extension,
  };
}

/**
 * Compute the source-image crop rect for a passport photo.
 *
 * Algorithm:
 *   1. Extend the MediaPipe face box upward to include hair (chin-to-crown).
 *   2. Target head height = midpoint of spec's faceHeightRatio × output height.
 *      → cropHeight = headHeight / targetRatio.
 *   3. Aspect ratio of the crop matches the spec aspect ratio.
 *   4. Eye line sits at midpoint of eyeLineRatio × cropHeight from the top.
 *      → cropTop = eyeY - eyeFromTop.
 *   5. Centre horizontally on eyeX.
 *   6. If the crop falls outside the source image, return needsPadding=true.
 */
export function computeCrop(landmarks: FaceLandmarks, spec: PhotoSpec): CropResult {
  const { faceBox, eyeY, eyeX, imageWidth, imageHeight } = landmarks;

  const headBox = chinToCrownBox(faceBox);

  const targetHeadRatio = spec.faceHeightTarget;
  const targetEyeRatio = spec.eyeLineTarget;

  // headBox.height (in source) → targetHeadRatio × cropHeight (in source)
  const cropHeight = headBox.height / targetHeadRatio;
  const cropWidth = cropHeight * (spec.widthMm / spec.heightMm);

  // Eye line should sit targetEyeRatio × cropHeight from the top of the crop.
  const eyeFromTop = targetEyeRatio * cropHeight;
  const cropTop = eyeY - eyeFromTop;
  const cropLeft = eyeX - cropWidth / 2;

  const crop: BBox = {
    x: cropLeft,
    y: cropTop,
    width: cropWidth,
    height: cropHeight,
  };

  const padTop = Math.max(0, -cropTop);
  const padLeft = Math.max(0, -cropLeft);
  const padRight = Math.max(0, cropLeft + cropWidth - imageWidth);
  const padBottom = Math.max(0, cropTop + cropHeight - imageHeight);
  const needsPadding = padTop + padLeft + padRight + padBottom > 0;

  return {
    crop,
    needsPadding,
    padding: { top: padTop, right: padRight, bottom: padBottom, left: padLeft },
  };
}
