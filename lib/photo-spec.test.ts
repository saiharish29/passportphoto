import { describe, expect, it } from 'vitest';
import { mmToPx, mmToPt, specPixelSize, PHOTO_SPECS } from './photo-spec';

describe('mmToPx', () => {
  it('converts 51mm at 300 DPI to ~602 px', () => {
    // 51 / 25.4 * 300 = 602.36...
    expect(mmToPx(51, 300)).toBe(602);
  });

  it('converts 35mm at 300 DPI to ~413 px', () => {
    // 35 / 25.4 * 300 = 413.38...
    expect(mmToPx(35, 300)).toBe(413);
  });

  it('converts 45mm at 300 DPI to ~531 px', () => {
    expect(mmToPx(45, 300)).toBe(531);
  });

  it('rounds to nearest pixel', () => {
    expect(mmToPx(0.5, 300)).toBe(6); // 0.5/25.4*300 = 5.905
  });
});

describe('mmToPt', () => {
  it('converts 25.4mm to 72pt (one inch)', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 5);
  });

  it('converts 210mm (A4 width) to ~595.28pt', () => {
    expect(mmToPt(210)).toBeCloseTo(595.28, 1);
  });

  it('converts 297mm (A4 height) to ~841.89pt', () => {
    expect(mmToPt(297)).toBeCloseTo(841.89, 1);
  });
});

describe('specPixelSize', () => {
  it('Seva 51mm spec produces ~602×602 px', () => {
    const size = specPixelSize(PHOTO_SPECS['seva-51']);
    expect(size).toEqual({ width: 602, height: 602 });
  });

  it('Physical 35×45mm spec produces ~413×531 px', () => {
    const size = specPixelSize(PHOTO_SPECS['physical-35x45']);
    expect(size).toEqual({ width: 413, height: 531 });
  });
});
