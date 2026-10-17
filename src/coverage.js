import { roundNumber } from './geometry.js';
import { isReached, polylineSegments, segmentGrid } from './segment-grid.js';

function coveredRatio(pixels, raster, segments, tolerance) {
  if (pixels.length === 0) {
    return { ratio: 1, uncovered: [] };
  }

  const { width, height } = raster;
  const grid = segmentGrid(segments, width, height, tolerance);
  const uncovered = pixels.filter((index) => {
    const point = {
      x: (index % width) + 0.5,
      y: Math.floor(index / width) + 0.5,
    };
    return !isReached(point, grid, tolerance);
  });

  return {
    ratio: (pixels.length - uncovered.length) / pixels.length,
    uncovered,
  };
}

function activePixels(mask) {
  const pixels = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) {
      pixels.push(index);
    }
  }

  return pixels;
}

function inkPrecision(segments, mask, width, height) {
  let samples = 0;
  let onInk = 0;

  for (const [start, end] of segments) {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const count = Math.max(1, Math.ceil(length / 0.5));

    for (let step = 0; step <= count; step += 1) {
      const x = Math.floor(start.x + ((end.x - start.x) * step) / count);
      const y = Math.floor(start.y + ((end.y - start.y) * step) / count);
      samples += 1;

      if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) {
        onInk += 1;
      }
    }
  }

  return samples === 0 ? 1 : onInk / samples;
}

/**
 * Measure how completely the vector strokes reproduce the raster.
 *
 * - `skeleton`: share of thinned centerline pixels that lie on the path (within
 *   half a pen width). 1 means no branch, loop or dot was dropped.
 * - `mask`: share of ink pixels that the rendered pen (path + stroke width)
 *   reaches.
 * - `precision`: share of path samples that lie on ink.
 *
 * @param {{ width: number, height: number, mask: Uint8Array,
 * skeleton: Uint8Array, strokeWidth: number }} input - Raster data.
 * @param {{ x: number, y: number }[][]} strokes - Stroke polylines.
 * @returns {{ penWidth: number, skeleton: number, mask: number,
 * precision: number,
 * uncoveredSkeletonPixels: number[] }} Coverage ratios in [0, 1].
 */
export function measureCoverage(input, strokes) {
  const { width, height, mask, skeleton, strokeWidth } = input;
  const segments = polylineSegments(strokes);
  const halfWidth = strokeWidth / 2;
  const skeletonCoverage = coveredRatio(
    activePixels(skeleton),
    input,
    segments,
    Math.max(1, halfWidth) + 0.5
  );
  const maskCoverage = coveredRatio(
    activePixels(mask),
    input,
    segments,
    halfWidth + Math.SQRT1_2
  );

  return {
    penWidth: roundNumber(strokeWidth),
    skeleton: skeletonCoverage.ratio,
    mask: maskCoverage.ratio,
    precision: inkPrecision(segments, mask, width, height),
    uncoveredSkeletonPixels: skeletonCoverage.uncovered,
  };
}
