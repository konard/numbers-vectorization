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
