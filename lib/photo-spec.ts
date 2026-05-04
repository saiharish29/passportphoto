/**
 * Indian passport photo specifications.
 *
 * Two specs are supported:
 *
 * 1. PASSPORT_SEVA_51 — for online application upload at passportindia.gov.in.
 *    Spec: 51 × 51 mm, white background, 300 DPI recommended.
 *    Source: Passport Seva photograph specifications.
 *
 * 2. PHYSICAL_35x45 — for the physical paper passport application.
 *    Spec: 35 × 45 mm, white background, 300 DPI.
 *    Source: Bureau of Immigration / MEA guidelines.
 *
 * Face occupies 70–80% of frame height (eyes positioned in upper third).
 *
 * Note: regulations evolve. Always link the user to the official spec in the UI
 * so they can self-verify.
 */
export type PhotoSpecId = 'seva-51' | 'physical-35x45';

export interface PhotoSpec {
  id: PhotoSpecId;
  label: string;
  description: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** Allowed range for face height as a fraction of total photo height (validation). */
  faceHeightRatio: { min: number; max: number };
  /** Target face-height ratio used by the crop algorithm. We bias toward
   *  the lower end of the allowed range so there's visible headroom above
   *  hair, even when MediaPipe under-estimates the crown position. */
  faceHeightTarget: number;
  /** Allowed range for eye-line position from the TOP of the photo. */
  eyeLineRatio: { min: number; max: number };
  /** Target eye-line position used by the crop algorithm. */
  eyeLineTarget: number;
  officialUrl: string;
}

export const PHOTO_SPECS: Record<PhotoSpecId, PhotoSpec> = {
  'seva-51': {
    id: 'seva-51',
    label: '51 × 51 mm (Passport Seva online)',
    description: 'For online passport application upload',
    widthMm: 51,
    heightMm: 51,
    dpi: 300,
    faceHeightRatio: { min: 0.7, max: 0.8 },
    // Bias to lower end → ~26% headroom above hair, well within 70-80% spec
    faceHeightTarget: 0.70,
    eyeLineRatio: { min: 0.3, max: 0.4 },
    eyeLineTarget: 0.36,
    officialUrl: 'https://www.passportindia.gov.in/',
  },
  'physical-35x45': {
    id: 'physical-35x45',
    label: '35 × 45 mm (physical application)',
    description: 'For physical passport office submission',
    widthMm: 35,
    heightMm: 45,
    dpi: 300,
    faceHeightRatio: { min: 0.7, max: 0.8 },
    faceHeightTarget: 0.70,
    eyeLineRatio: { min: 0.3, max: 0.4 },
    eyeLineTarget: 0.36,
    officialUrl: 'https://www.passportindia.gov.in/',
  },
};

export const DEFAULT_SPEC: PhotoSpecId = 'seva-51';

/** Convert millimetres to pixels at a given DPI. */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/** Convert millimetres to PDF points (1 pt = 1/72 inch). */
export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72;
}

/** Pixel dimensions of the output image for a spec. */
export function specPixelSize(spec: PhotoSpec): { width: number; height: number } {
  return {
    width: mmToPx(spec.widthMm, spec.dpi),
    height: mmToPx(spec.heightMm, spec.dpi),
  };
}
