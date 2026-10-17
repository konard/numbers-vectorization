import { describe, it, expect } from 'test-anywhere';

import { vectorizeRasterLine } from '../src/index.js';
import {
  MULTI_STROKE_SHAPES,
  fourRaster,
  multiStrokeRaster,
} from './helpers/issue-7-shapes.js';
import { SHAPES, rasterFromRows } from './helpers/shapes.js';

function retrace(result) {
  return result.strokes.reduce((sum, stroke) => sum + stroke.retraceLength, 0);
}

/** Largest distance of a stroke's points from the chord between its ends. */
function bulge(points) {
  const [first, last] = [points[0], points.at(-1)];
  const length = Math.hypot(last.x - first.x, last.y - first.y) || 1;

  return Math.max(
    ...points.map(
      (p) =>
        Math.abs(
          (last.x - first.x) * (first.y - p.y) -
            (first.x - p.x) * (last.y - first.y)
        ) / length
    )
  );
}

describe('crossing lines are separate pen strokes (issue 7)', () => {
  for (const name of Object.keys(MULTI_STROKE_SHAPES)) {
    it(`draws the ${name} as ${MULTI_STROKE_SHAPES[name].length} strokes without retracing`, () => {
      const result = vectorizeRasterLine(multiStrokeRaster(name));

      expect(result.strokes.length).toBe(MULTI_STROKE_SHAPES[name].length);
      expect(retrace(result)).toBe(0);
      expect(result.coverage.edges.traversed).toBe(result.coverage.edges.total);
      expect(result.coverage.mask >= 0.97).toBe(true);
    });
  }

  for (const name of ['plus', 'cross', 'tee']) {
    it(`keeps each stroke of the ${name} a straight line`, () => {
      const result = vectorizeRasterLine(multiStrokeRaster(name));

      for (const stroke of result.strokes) {
        expect(bulge(stroke.points) < 3).toBe(true);
      }
    });
  }

  it('keeps the crossing node in the stroke network', () => {
    const result = vectorizeRasterLine(multiStrokeRaster('plus'));

    expect(result.graph.nodes.some((node) => node.degree === 4)).toBe(true);
    expect(result.graph.edges.length).toBe(4);
  });

  it('keeps shapes drawn in one movement as one stroke', () => {
    for (const name of ['zero', 'eight', 'six']) {
      const result = vectorizeRasterLine(rasterFromRows(SHAPES[name]));

      expect(result.strokes.length).toBe(1);
    }

    const four = vectorizeRasterLine(fourRaster(30));

    expect(four.strokes.length).toBe(1);
    expect(retrace(four)).toBe(0);
  });
});
