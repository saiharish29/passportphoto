import type { BBox, FaceLandmarks } from './crop-math';
import type { PhotoSpec } from './photo-spec';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
}

export interface ValidationContext extends FaceLandmarks {
  /** Number of faces detected. */
  faceCount: number;
  /** Roll angle of the head in degrees (0 = upright). */
  rollDegrees: number;
  /** Estimated minimum brightness across the image (0–255). */
  minBrightness?: number;
  /** Estimated maximum brightness across the image (0–255). */
  maxBrightness?: number;
}

/**
 * Validate a captured/uploaded image against passport-photo requirements.
 *
 * Returns a list of issues sorted by severity. An empty list means the photo
 * passes all checks. Errors block submission; warnings are surfaced to the user
 * but don't block.
 */
export function validateImage(ctx: ValidationContext, spec: PhotoSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Face count
  if (ctx.faceCount === 0) {
    issues.push({
      code: 'NO_FACE',
      severity: 'error',
      message: 'No face detected. Make sure your face is clearly visible.',
    });
    return issues; // Other checks don't make sense without a face.
  }
  if (ctx.faceCount > 1) {
    issues.push({
      code: 'MULTIPLE_FACES',
      severity: 'error',
      message: `${ctx.faceCount} faces detected. Only one person should be in the frame.`,
    });
  }

  // 2. Resolution: face must be at least 200 px tall in source for a usable crop.
  if (ctx.faceBox.height < 200) {
    issues.push({
      code: 'LOW_RESOLUTION',
      severity: 'error',
      message: 'Image resolution is too low. Move closer or use a better camera.',
    });
  }

  // 3. Head tilt (roll angle)
  if (Math.abs(ctx.rollDegrees) > 8) {
    issues.push({
      code: 'HEAD_TILTED',
      severity: 'error',
      message: 'Your head is tilted. Hold it straight and look directly at the camera.',
    });
  } else if (Math.abs(ctx.rollDegrees) > 4) {
    issues.push({
      code: 'HEAD_SLIGHTLY_TILTED',
      severity: 'warning',
      message: 'Your head looks slightly tilted. Try to keep it level.',
    });
  }

  // 4. Centering: eye midpoint should be within 15% of horizontal centre.
  const horizontalOffset = Math.abs(ctx.eyeX - ctx.imageWidth / 2) / ctx.imageWidth;
  if (horizontalOffset > 0.15) {
    issues.push({
      code: 'OFF_CENTRE',
      severity: 'error',
      message: 'Centre your face in the frame.',
    });
  }

  // 5. Face-size sanity: face should occupy at least 25% of image height (otherwise too zoomed out).
  const faceRatio = ctx.faceBox.height / ctx.imageHeight;
  if (faceRatio < 0.25) {
    issues.push({
      code: 'FACE_TOO_SMALL',
      severity: 'warning',
      message: 'Move closer to the camera so your face fills more of the frame.',
    });
  } else if (faceRatio > 0.85) {
    issues.push({
      code: 'FACE_TOO_LARGE',
      severity: 'warning',
      message: 'Move back slightly. Your face is too close to the camera.',
    });
  }

  // 6. Lighting (only if brightness data is available)
  if (ctx.minBrightness !== undefined && ctx.maxBrightness !== undefined) {
    if (ctx.maxBrightness < 80) {
      issues.push({
        code: 'TOO_DARK',
        severity: 'error',
        message: 'Image is too dark. Move to a well-lit area.',
      });
    }
    const dynamicRange = ctx.maxBrightness - ctx.minBrightness;
    if (dynamicRange > 200 && ctx.maxBrightness > 240) {
      issues.push({
        code: 'HARSH_LIGHTING',
        severity: 'warning',
        message: 'Lighting is uneven. Avoid direct sunlight or harsh shadows.',
      });
    }
  }

  // 7. Sanity: silence the unused-import warning
  void (spec.id);

  // Sort: errors before warnings before info
  const order: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** True if there are no errors (warnings allowed). */
export function isAcceptable(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === 'error');
}

// Re-export BBox so consumers can import from one place
export type { BBox };
