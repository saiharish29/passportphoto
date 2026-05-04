import { describe, expect, it } from 'vitest';
import { computeCrop, chinToCrownBox, type FaceLandmarks } from './crop-math';
import { PHOTO_SPECS } from './photo-spec';

const seva = PHOTO_SPECS['seva-51'];
const physical = PHOTO_SPECS['physical-35x45'];

/** Helper: build a landmarks object centred in a square image. */
function centredFace(imageSize: number, faceSize: number): FaceLandmarks {
  const cx = imageSize / 2;
  const cy = imageSize / 2;
  return {
    imageWidth: imageSize,
    imageHeight: imageSize,
    faceBox: {
      x: cx - faceSize / 2,
      y: cy - faceSize / 2,
      width: faceSize,
      height: faceSize,
    },
    eyeX: cx,
    // Eyes sit ~40% down from top of face bbox (which is forehead, not crown)
    eyeY: cy - faceSize / 2 + faceSize * 0.4,
  };
}

describe('chinToCrownBox', () => {
  it('extends the face box upward by 48% of face height', () => {
    const head = chinToCrownBox({ x: 100, y: 200, width: 400, height: 500 });
    expect(head.x).toBe(100);
    expect(head.width).toBe(400);
    // Top moves up by 0.48 * 500 = 240
    expect(head.y).toBe(200 - 240);
    // Height grows by the same 240
    expect(head.height).toBe(500 + 240);
  });

  it('keeps the chin position unchanged', () => {
    const orig = { x: 100, y: 200, width: 400, height: 500 };
    const head = chinToCrownBox(orig);
    expect(head.y + head.height).toBe(orig.y + orig.height);
  });
});

describe('computeCrop — Seva 51×51 spec', () => {
  it('produces a square crop for a square spec', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, seva);
    expect(crop.width).toBeCloseTo(crop.height, 5);
  });

  it('places the (extended) head at the spec target ratio of crop height', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, seva);
    // Head height = face height * (1 + HAIR_EXTENSION_RATIO) = 800 * 1.48 = 1184
    const headHeight = landmarks.faceBox.height * 1.48;
    const headRatio = headHeight / crop.height;
    expect(headRatio).toBeCloseTo(seva.faceHeightTarget, 2);
  });

  it('keeps the head ratio within the ICAO/Passport Seva allowed range', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, seva);
    const headHeight = landmarks.faceBox.height * 1.48;
    const headRatio = headHeight / crop.height;
    expect(headRatio).toBeGreaterThanOrEqual(seva.faceHeightRatio.min);
    expect(headRatio).toBeLessThanOrEqual(seva.faceHeightRatio.max);
  });

  it('positions eyes at the spec target eye-line ratio', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, seva);
    const eyeFromCropTop = landmarks.eyeY - crop.y;
    expect(eyeFromCropTop / crop.height).toBeCloseTo(seva.eyeLineTarget, 2);
  });

  it('leaves comfortable headroom above the forehead (hair must not look clipped)', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, seva);
    // The MediaPipe face-box top is the forehead. The crop top is above the
    // forehead by HAIR_EXTENSION_RATIO * face_height plus extra headroom from
    // the lower target ratio. We require AT LEAST 12% of crop height as
    // visible margin above the forehead — the threshold that distinguishes
    // "comfortably framed" from "barely missed clipping".
    const headroom = landmarks.faceBox.y - crop.y;
    expect(headroom).toBeGreaterThan(0);
    expect(headroom / crop.height).toBeGreaterThan(0.12);
  });

  it('centres the crop horizontally on the eye midpoint', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, seva);
    const cropCentreX = crop.x + crop.width / 2;
    expect(cropCentreX).toBeCloseTo(landmarks.eyeX, 5);
  });

  it('flags needsPadding when face is too close to top edge', () => {
    const landmarks: FaceLandmarks = {
      imageWidth: 1000,
      imageHeight: 1000,
      faceBox: { x: 100, y: 0, width: 800, height: 800 },
      eyeX: 500,
      eyeY: 80,
    };
    const result = computeCrop(landmarks, seva);
    expect(result.needsPadding).toBe(true);
    expect(result.padding.top).toBeGreaterThan(0);
  });

  it('does not flag padding when face has plenty of margin', () => {
    const landmarks = centredFace(4000, 800);
    const result = computeCrop(landmarks, seva);
    expect(result.needsPadding).toBe(false);
  });
});

describe('computeCrop — physical 35×45 spec', () => {
  it('produces a portrait-aspect crop (35:45)', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, physical);
    const aspect = crop.width / crop.height;
    expect(aspect).toBeCloseTo(35 / 45, 3);
  });

  it('places the head at spec target ratio (with hair extension)', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, physical);
    const headHeight = landmarks.faceBox.height * 1.48;
    expect(headHeight / crop.height).toBeCloseTo(physical.faceHeightTarget, 2);
  });

  it('leaves comfortable headroom for 35×45 spec', () => {
    const landmarks = centredFace(2000, 800);
    const { crop } = computeCrop(landmarks, physical);
    const headroom = landmarks.faceBox.y - crop.y;
    expect(headroom / crop.height).toBeGreaterThan(0.12);
  });
});
