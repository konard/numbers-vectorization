import { describe, it, expect } from 'test-anywhere';

import { budgetPolylines, vectorizeRasterLine } from '../src/index.js';
import {
  MULTI_STROKE_SHAPES,
  fourRaster,
  multiStrokeRaster,
} from './helpers/issue-7-shapes.js';
import { circlePoints, penRaster } from './helpers/shapes.js';

function pointCount(result) {
  return result.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

// A dash and a ring: two separate shapes.
const TWO_SHAPES = penRaster(
  80,
  40,
  [
    [
      [8, 20],
      [30, 20],
    ],
    circlePoints(58, 20, 12),
  ],
  2.5
);

describe('each shape is explained with the fewest points (issue 7)', () => {
  it('tunes the tolerance per shape and reports it', () => {
    const result = vectorizeRasterLine(TWO_SHAPES);
    const { simplification } = result;

    expect(simplification.tolerance).toBe('auto');
    expect(simplification.shapes.length).toBe(2);
    for (const shape of simplification.shapes) {
      expect(shape.points >= 2).toBe(true);
      expect(shape.match > 0.6).toBe(true);
    }
    expect(
      simplification.shapes.reduce((sum, shape) => sum + shape.points, 0)
    ).toBe(pointCount(result));
  });

  it('draws a straight dash with its two ends only', () => {
    const result = vectorizeRasterLine(TWO_SHAPES);
    const dash = result.strokes.find((stroke) =>
      stroke.points.every((point) => point.x < 40)
    );

    expect(dash.points.length).toBe(2);
  });

  for (const name of ['plus', 'cross', 'tee']) {
    it(`draws the ${name} with 4 points: two straight strokes`, () => {
      expect(pointCount(vectorizeRasterLine(multiStrokeRaster(name)))).toBe(4);
    });
  }

  for (const [name, raster] of [
    ['seven', multiStrokeRaster('seven')],
    ['letterA', multiStrokeRaster('letterA')],
    ['four', fourRaster(30)],
  ]) {
    it(`needs fewer points than a fixed tolerance for the ${name}`, () => {
      const auto = vectorizeRasterLine(raster);
      const fixed = vectorizeRasterLine(raster, { simplifyTolerance: 0.85 });

      expect(pointCount(auto) < pointCount(fixed)).toBe(true);
      expect(auto.simplification.shapes[0].match > 0.85).toBe(true);
      expect(auto.coverage.edges.traversed).toBe(auto.coverage.edges.total);
    });
  }

  it('uses a manual tolerance as is', () => {
    const result = vectorizeRasterLine(multiStrokeRaster('seven'), {
      simplifyTolerance: 0.85,
    });

    expect(result.simplification.tolerance).toBe(0.85);
    for (const shape of result.simplification.shapes) {
      expect(shape.tolerance).toBe(0.85);
    }
  });

  it('trades points for detail with the point cost', () => {
    const raster = fourRaster(30);
    const cheap = vectorizeRasterLine(raster, { pointCost: 0.1 });
    const dear = vectorizeRasterLine(raster, { pointCost: 10 });

    expect(pointCount(cheap) > pointCount(dear)).toBe(true);
  });
});

describe('a point budget per shape (issue 7)', () => {
  for (const budget of [1, 2, 3, 4]) {
    it(`keeps at most ${budget} point(s) per shape`, () => {
      for (const raster of [
        TWO_SHAPES,
        multiStrokeRaster('letterA'),
        fourRaster(30),
      ]) {
        const result = vectorizeRasterLine(raster, { maxPoints: budget });

        for (const shape of result.simplification.shapes) {
          expect(shape.points <= budget).toBe(true);
        }
        expect(result.strokes.length > 0).toBe(true);
      }
    });
  }

  it('leaves one dot per shape with a budget of one', () => {
    const result = vectorizeRasterLine(TWO_SHAPES, { maxPoints: 1 });

    expect(result.strokes.length).toBe(2);
    for (const stroke of result.strokes) {
      expect(stroke.points.length).toBe(1);
    }
    // A dot is a zero-length segment, drawn as a round pen dab.
    expect(result.path.match(/M/g).length).toBe(2);
  });

  it('spends a small budget on the corner of the 7, not on its bar', () => {
    const result = vectorizeRasterLine(multiStrokeRaster('seven'), {
      maxPoints: 4,
    });
    const longest = result.strokes.reduce((a, b) =>
      b.points.length > a.points.length ? b : a
    );

    expect(longest.points.length >= 3).toBe(true);
    expect(result.simplification.shapes[0].match > 0.7).toBe(true);
  });

  it(`keeps every stroke when the budget allows (${Object.keys(MULTI_STROKE_SHAPES).length} shapes)`, () => {
    for (const name of Object.keys(MULTI_STROKE_SHAPES)) {
      const free = vectorizeRasterLine(multiStrokeRaster(name));
      const budgeted = vectorizeRasterLine(multiStrokeRaster(name), {
        maxPoints: 100,
      });

      expect(budgeted.strokes.length).toBe(free.strokes.length);
      expect(pointCount(budgeted)).toBe(pointCount(free));
    }
  });

  it('runs Douglas-Peucker top-down over all strokes at once', () => {
    const zigzag = [
      { x: 0, y: 0 },
      { x: 10, y: 8 },
      { x: 20, y: 0 },
      { x: 30, y: 1 },
      { x: 40, y: 0 },
    ];
    const line = [
      { x: 0, y: 20 },
      { x: 5, y: 20 },
    ];

    expect(budgetPolylines([zigzag, line], 3)).toEqual([
      [zigzag[0], zigzag[1], zigzag[4]],
      null,
    ]);
    expect(budgetPolylines([zigzag, line], 4)).toEqual([
      [zigzag[0], zigzag[4]],
      line,
    ]);
    expect(budgetPolylines([zigzag, line], 1)).toEqual([[zigzag[2]], null]);
  });
});
