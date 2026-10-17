import { describe, it, expect } from 'test-anywhere';

import { resolveThreshold, vectorizeRasterLine } from '../src/index.js';

const GRAY = { width: 4, height: 1, pixels: [0, 10, 200, 255] };
// Dark ink on light paper.
const PAPER = { width: 4, height: 1, pixels: [255, 250, 245, 10] };
const RGBA = {
  width: 2,
  height: 1,
  pixels: [20, 20, 20, 255, 0, 0, 0, 0],
};

describe('the threshold actually used is reported (issue 7)', () => {
  it('fills in the defaults for manual thresholds', () => {
    expect(resolveThreshold(GRAY)).toEqual({
      foreground: 'light',
      threshold: 32,
      auto: false,
    });
    expect(resolveThreshold(RGBA)).toEqual({
      foreground: 'dark',
      threshold: 224,
      auto: false,
    });
    expect(resolveThreshold(GRAY, { threshold: 100 }).threshold).toBe(100);
  });

  it('reports the Otsu threshold and polarity chosen automatically', () => {
    const paper = resolveThreshold(PAPER, { foreground: 'auto' });
    const screen = resolveThreshold(GRAY, { foreground: 'auto' });

    expect(paper.auto).toBe(true);
    expect(paper.foreground).toBe('dark');
    expect(paper.threshold >= 10 && paper.threshold < 245).toBe(true);
    expect(screen.foreground).toBe('light');
    expect(
      resolveThreshold(PAPER, { foreground: 'auto', threshold: 50 })
    ).toEqual({ foreground: 'dark', threshold: 50, auto: false });
  });

  it('keeps all of a single-color ink on a transparent canvas', () => {
    // Browser pencil strokes: un-premultiplied anti-aliased pixels vary by a
    // few luminance levels (23-25) around the ink color; Otsu would split
    // them and keep only the outline.
    const width = 9;
    const pixels = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y += 1) {
      [3, 4, 5].forEach((x) => {
        const offset = (y * width + x) * 4;
        const level = x === 4 ? 24 : 23 + (y % 3);
        pixels.set([level, level, level, x === 4 ? 255 : 200], offset);
      });
    }
    const raster = { width, height: width, pixels };
    const options = { foreground: 'auto', alphaThreshold: 24 };
    const mask = vectorizeRasterLine(raster, options).mask;

    expect(resolveThreshold(raster, options)).toEqual({
      foreground: 'dark',
      threshold: 255,
      auto: true,
    });
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(width * 3);
  });

  it('still splits two inks of clear contrast on a transparent canvas', () => {
    const raster = {
      width: 4,
      height: 1,
      pixels: [
        10, 10, 10, 255, 12, 12, 12, 255, 200, 200, 200, 255, 0, 0, 0, 0,
      ],
    };
    const resolved = resolveThreshold(raster, { foreground: 'auto' });

    expect(resolved.foreground).toBe('dark');
    expect(resolved.threshold >= 12 && resolved.threshold < 200).toBe(true);
  });

  it('adds the threshold to the result', () => {
    const raster = {
      width: 5,
      height: 5,
      pixels: Array.from({ length: 25 }, (_, i) => (i % 5 === 2 ? 255 : 0)),
    };

    expect(vectorizeRasterLine(raster).thresholding).toEqual(
      resolveThreshold(raster)
    );
    expect(
      vectorizeRasterLine(raster, { foreground: 'auto' }).thresholding.auto
    ).toBe(true);
  });
});

describe('every setting is reported as it was used (issue 7)', () => {
  const LINE = {
    width: 9,
    height: 5,
    pixels: Array.from({ length: 45 }, (_, i) =>
      Math.floor(i / 9) === 2 && i % 9 > 0 && i % 9 < 8 ? 255 : 0
    ),
  };

  it('fills in the defaults and lists what was chosen automatically', () => {
    const { settings, strokeWidth } = vectorizeRasterLine(LINE);

    expect(settings).toEqual({
      foreground: 'light',
      threshold: 32,
      alphaThreshold: 64,
      fillHoles: 2,
      simplifyTolerance: 'auto',
      pointCost: 1,
      maxPoints: null,
      penLifts: true,
      penLiftCost: 2.5,
      lookAhead: 3,
      strokeWidth,
      curve: 'linear',
      automatic: ['simplifyTolerance', 'strokeWidth'],
    });
  });

  it('keeps manual settings as they were set', () => {
    const manual = {
      foreground: 'light',
      threshold: 100,
      alphaThreshold: 10,
      fillHoles: 0,
      simplifyTolerance: 1.5,
      pointCost: 4,
      maxPoints: 1,
      penLifts: false,
      penLiftCost: 7,
      lookAhead: 5,
      strokeWidth: 3,
      curve: 'smooth',
    };
    const { settings } = vectorizeRasterLine(LINE, manual);

    expect(settings).toEqual({ ...manual, automatic: [] });
    expect(
      vectorizeRasterLine(LINE, { foreground: 'auto' }).settings.automatic
    ).toEqual(['foreground', 'threshold', 'simplifyTolerance', 'strokeWidth']);
  });
});
