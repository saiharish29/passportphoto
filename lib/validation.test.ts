import { describe, expect, it } from 'vitest';
import { validateImage, isAcceptable, type ValidationContext } from './validation';
import { PHOTO_SPECS } from './photo-spec';

const seva = PHOTO_SPECS['seva-51'];

function goodCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    imageWidth: 2000,
    imageHeight: 2000,
    faceBox: { x: 700, y: 600, width: 600, height: 600 },
    eyeX: 1000,
    eyeY: 850,
    faceCount: 1,
    rollDegrees: 1,
    minBrightness: 60,
    maxBrightness: 200,
    ...overrides,
  };
}

describe('validateImage', () => {
  it('passes a clean image', () => {
    const issues = validateImage(goodCtx(), seva);
    expect(issues).toEqual([]);
    expect(isAcceptable(issues)).toBe(true);
  });

  it('rejects no face', () => {
    const issues = validateImage(goodCtx({ faceCount: 0 }), seva);
    expect(issues[0].code).toBe('NO_FACE');
    expect(isAcceptable(issues)).toBe(false);
  });

  it('rejects multiple faces', () => {
    const issues = validateImage(goodCtx({ faceCount: 2 }), seva);
    expect(issues.some((i) => i.code === 'MULTIPLE_FACES')).toBe(true);
    expect(isAcceptable(issues)).toBe(false);
  });

  it('rejects a tilted head (>8°)', () => {
    const issues = validateImage(goodCtx({ rollDegrees: 12 }), seva);
    expect(issues.some((i) => i.code === 'HEAD_TILTED' && i.severity === 'error')).toBe(true);
  });

  it('warns on slight tilt (4-8°)', () => {
    const issues = validateImage(goodCtx({ rollDegrees: 6 }), seva);
    const tilt = issues.find((i) => i.code === 'HEAD_SLIGHTLY_TILTED');
    expect(tilt?.severity).toBe('warning');
    expect(isAcceptable(issues)).toBe(true); // warnings don't block
  });

  it('rejects off-centre face (>15% offset)', () => {
    const issues = validateImage(goodCtx({ eyeX: 600 }), seva); // 1000 - 600 = 400 px = 20%
    expect(issues.some((i) => i.code === 'OFF_CENTRE')).toBe(true);
  });

  it('rejects low resolution face', () => {
    const issues = validateImage(
      goodCtx({ faceBox: { x: 0, y: 0, width: 150, height: 150 } }),
      seva,
    );
    expect(issues.some((i) => i.code === 'LOW_RESOLUTION')).toBe(true);
  });

  it('warns on too-small face in frame', () => {
    const issues = validateImage(
      goodCtx({ faceBox: { x: 700, y: 700, width: 400, height: 400 } }),
      seva,
    );
    expect(issues.some((i) => i.code === 'FACE_TOO_SMALL' && i.severity === 'warning')).toBe(true);
  });

  it('rejects very dark image', () => {
    const issues = validateImage(goodCtx({ minBrightness: 5, maxBrightness: 40 }), seva);
    expect(issues.some((i) => i.code === 'TOO_DARK')).toBe(true);
  });

  it('warns on harsh lighting', () => {
    const issues = validateImage(goodCtx({ minBrightness: 10, maxBrightness: 250 }), seva);
    expect(issues.some((i) => i.code === 'HARSH_LIGHTING')).toBe(true);
  });

  it('sorts errors before warnings', () => {
    const issues = validateImage(
      goodCtx({
        rollDegrees: 6, // warning
        eyeX: 500, // error: off-centre
      }),
      seva,
    );
    expect(issues[0].severity).toBe('error');
    // The first warning should come after all errors
    const firstWarningIdx = issues.findIndex((i) => i.severity === 'warning');
    const lastErrorIdx = issues.map((i) => i.severity).lastIndexOf('error');
    if (firstWarningIdx >= 0 && lastErrorIdx >= 0) {
      expect(firstWarningIdx).toBeGreaterThan(lastErrorIdx);
    }
  });
});
