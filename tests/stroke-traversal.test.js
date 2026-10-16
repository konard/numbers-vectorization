import { describe, it, expect } from 'test-anywhere';
import { Parser } from 'links-notation';

import { LinksStore, planStrokes, vectorizeRasterLine } from '../src/index.js';
import { loadBundledMnistSamples } from './helpers/mnist-samples.js';
import { SHAPES, rasterFromRows } from './helpers/shapes.js';

function vectorizeShape(name, options) {
  return vectorizeRasterLine(rasterFromRows(SHAPES[name]), options);
}

function subpathCount(path) {
  return path.split('M ').length - 1;
}

function expectFullyDrawn(result) {
  expect(result.coverage.skeleton).toBe(1);
  expect(result.coverage.edges.traversed).toBe(result.coverage.edges.total);
}

describe('stroke graph traversal (issue 5)', () => {
  it('draws a closed loop as one stroke that returns to its start', () => {
    const result = vectorizeShape('zero');
    const [stroke] = result.strokes;

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(stroke.retraceLength).toBe(0);
    expect(stroke.points[0]).toEqual(stroke.points.at(-1));
    expect(result.coverage.mask).toBe(1);
  });

  it('draws both loops of an 8 in a single stroke without retracing', () => {
    const result = vectorizeShape('eight');

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(result.strokes[0].retraceLength).toBe(0);
    expect(result.graph.edges.length).toBe(3);
  });

  it('draws a loop with a tail (6) starting from the free end', () => {
    const result = vectorizeShape('six');
    const [stroke] = result.strokes;
    const degrees = result.graph.nodes.map((node) => node.degree).sort();

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(degrees).toEqual([1, 2, 3]);
    expect(stroke.points[0].y < 3).toBe(true);
  });

  it('crosses straight through a + junction and retraces the minimum', () => {
    const result = vectorizeShape('plus');
    const [stroke] = result.strokes;

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(result.graph.nodes.some((node) => node.degree === 4)).toBe(true);
    // Four arms of length 4: one pair of arms has to be drawn twice.
    expect(stroke.retraceLength).toBe(8);
  });

  it('makes a U-turn to draw the dead-end branch of a T junction', () => {
    const result = vectorizeShape('tee');
    const [stroke] = result.strokes;
    const retraced = stroke.steps.filter((step) => step.retrace);

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(retraced.length).toBe(1);
    expect(stroke.retraceLength).toBe(4);
    expect(result.lino.includes(' retrace)')).toBe(true);
  });

  it('emits one subpath per connected component', () => {
    const result = vectorizeShape('equals');

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(2);
    expect(subpathCount(result.path)).toBe(2);
    expect(result.strokes[0].points[0].y < result.strokes[1].points[0].y).toBe(
      true
    );
  });

  it('keeps isolated dots and tiny blobs as zero-length strokes', () => {
    for (const name of ['dot', 'block']) {
      const result = vectorizeShape(name);

      expect(result.strokes.length).toBe(1);
      expect(result.strokes[0].steps.length).toBe(0);
      expect(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/.test(result.path)).toBe(true);
      expect(result.coverage.mask).toBe(1);
    }
  });

  it('outputs smooth cubic Bézier curves on request', () => {
    const linear = vectorizeShape('zero');
    const smooth = vectorizeShape('zero', { curve: 'smooth' });

    expect(linear.path.includes(' C ')).toBe(false);
    expect(smooth.path.includes(' C ')).toBe(true);
    expect(smooth.path.startsWith(linear.path.split(' L ')[0])).toBe(true);
  });

  it('exports the stroke graph as parseable Links Notation', () => {
    const result = vectorizeShape('six');
    const links = new Parser().parse(result.lino);
    const ids = links.map((link) => link.id);

    expect(result.lino.startsWith('(raster: size 10 11)')).toBe(true);
    expect(ids.includes('raster')).toBe(true);
    expect(ids.includes('stroke1')).toBe(true);
    expect(ids.filter((id) => /^e\d+$/.test(id)).length).toBe(
      result.graph.edges.length
    );
  });
});

describe('MNIST samples are fully vectorized (issue 5)', () => {
  const samples = loadBundledMnistSamples();

  it('bundles 50 samples', () => {
    expect(samples.length).toBe(50);
  });

  for (const { index, label, raster } of samples) {
    it(`sample ${index} (digit ${label}) draws every skeleton branch`, () => {
      const result = vectorizeRasterLine(raster);

      expectFullyDrawn(result);
      expect(result.coverage.mask >= 0.9).toBe(true);
      expect(result.coverage.precision >= 0.99).toBe(true);
      expect(result.strokes.length >= 1).toBe(true);
      expect(subpathCount(result.path)).toBe(result.strokes.length);
    });
  }
});

describe('LinksStore doublet storage', () => {
  it('creates, searches, updates and deletes links', () => {
    const store = new LinksStore();
    const a = store.createPoint({ x: 0, y: 0 });
    const b = store.createPoint({ x: 1, y: 0 });
    const edge = store.create(a, b, { length: 1 });

    expect(store.isPoint(a)).toBe(true);
    expect(store.isPoint(edge)).toBe(false);
    expect(store.search({ source: a })).toEqual([a, edge]);
    expect(store.degree(a)).toBe(1);
    expect(store.other(edge, a)).toBe(b);

    store.update(edge, b, b);
    expect(store.degree(b)).toBe(2);
    expect(store.degree(a)).toBe(0);

    store.delete(edge);
    expect(store.has(edge)).toBe(false);
    expect(store.edges()).toEqual([]);
  });

  it('plans an Euler trail over a hand-built graph', () => {
    const store = new LinksStore();
    const node = (x, y) => store.createPoint({ x, y, pixels: [] });
    const link = (source, target) => {
      const { x: x1, y: y1 } = store.getData(source);
      const { x: x2, y: y2 } = store.getData(target);
      store.create(source, target, {
        points: [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ],
        length: Math.hypot(x2 - x1, y2 - y1),
      });
    };
    const top = node(0, 0);
    const middle = node(0, 5);
    const left = node(-5, 10);
    const right = node(5, 10);
    link(top, middle);
    link(middle, left);
    link(middle, right);

    const [stroke] = planStrokes(store);
    const retraced = stroke.steps.filter((step) => step.retrace);
    const stem = store.search({ source: top, target: middle })[0];

    // The cheapest plan retraces the short stem (5 < 7.07) and leaves the
    // two long arms as the open ends; the top-left one is the start.
    expect(stroke.start).toBe(left);
    expect(stroke.steps.at(-1).to).toBe(right);
    expect(stroke.steps.length).toBe(4);
    expect(retraced.map((step) => step.edge)).toEqual([stem]);
  });
});
