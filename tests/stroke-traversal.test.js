import { describe, it, expect } from 'test-anywhere';
import { Parser } from 'links-notation';

import { LinksStore, planStrokes, vectorizeRasterLine } from '../src/index.js';
import { loadBundledMnistSamples } from './helpers/mnist-samples.js';
import {
  SHAPES,
  circlePoints,
  penRaster,
  rasterFromRows,
} from './helpers/shapes.js';

function vectorizeShape(name, options) {
  return vectorizeRasterLine(rasterFromRows(SHAPES[name]), options);
}

function subpathCount(path) {
  return path.split('M ').length - 1;
}

function expectFullyDrawn(result) {
  expect(result.coverage.skeleton).toBe(1);
  expect(result.coverage.links.traversed).toBe(result.coverage.links.total);
}

describe('stroke network traversal (issue 5)', () => {
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
    expect(result.network.links.length).toBe(3);
  });

  it('draws a loop with a tail (6) starting from the free end', () => {
    const result = vectorizeShape('six');
    const [stroke] = result.strokes;
    const degrees = result.network.points.map((node) => node.degree).sort();

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(degrees).toEqual([1, 2, 3]);
    expect(stroke.points[0].y < 3).toBe(true);
  });

  it('crosses straight through a + junction and retraces the minimum', () => {
    const result = vectorizeShape('plus', { penLifts: false });
    const [stroke] = result.strokes;

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(result.network.points.some((node) => node.degree === 4)).toBe(true);
    // Four arms of length 4: one pair of arms has to be drawn twice.
    expect(stroke.retraceLength).toBe(8);
  });

  it('makes a U-turn to draw the dead-end branch of a T junction', () => {
    const result = vectorizeShape('tee', { penLifts: false });
    const [stroke] = result.strokes;
    const retraced = stroke.steps.filter((step) => step.retrace);

    expectFullyDrawn(result);
    expect(result.strokes.length).toBe(1);
    expect(retraced.length).toBe(1);
    expect(stroke.retraceLength).toBe(4);
    expect(result.lino.includes(' retrace\n')).toBe(true);
  });

  it('lifts the pen instead where the lines cross straight (issue 7)', () => {
    for (const name of ['plus', 'tee']) {
      const result = vectorizeShape(name);

      expectFullyDrawn(result);
      expect(result.strokes.length).toBe(2);
      expect(result.strokes.every((s) => s.retraceLength === 0)).toBe(true);
    }
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

  it('adds no U-turn stubs where two thick pen loops overlap', () => {
    // A hand-drawn 8 at web-canvas scale: the loops overlap in a wide blob of
    // ink, which must not be "completed" with short dead-end branches.
    const raster = penRaster(
      200,
      200,
      [circlePoints(100, 60, 36), circlePoints(100, 136, 44)],
      7
    );
    const result = vectorizeRasterLine(raster);

    expect(result.strokes.length).toBe(1);
    expect(result.network.links.length).toBe(3);
    expect(result.strokes[0].retraceLength).toBe(0);
    expect(result.coverage.mask >= 0.95).toBe(true);
    expect(result.network.links.some((edge) => edge.completed)).toBe(false);
  });

  it('flags network links added by coverage completion', () => {
    const { raster } = loadBundledMnistSamples().find(
      (sample) => sample.index === 36
    );
    const result = vectorizeRasterLine(raster);
    const completed = result.network.links.filter((edge) => edge.completed);

    expect(completed.length >= 1).toBe(true);
    expect(completed.every((edge) => edge.points.length >= 2)).toBe(true);
    expectFullyDrawn(result);
  });

  it('exports the stroke network as indented Links Notation (issue 7)', () => {
    const result = vectorizeShape('six');
    const [root, ...rest] = new Parser().parseGroups(result.lino);
    const child = (group, id) =>
      group.children.find((entry) => entry.element.id === id);
    const network = child(root, 'network');
    const strokes = child(root, 'strokes');

    expect(rest.length).toBe(0);
    expect(root.element.id).toBe('vectorization');
    expect(result.lino.startsWith('vectorization:\n  raster 10 11\n')).toBe(
      true
    );
    expect(
      network.children.filter((entry) => /^p\d+$/.test(entry.element.id)).length
    ).toBe(result.network.points.length);
    expect(
      network.children.filter((entry) => /^l\d+$/.test(entry.element.id)).length
    ).toBe(result.network.links.length);
    expect(strokes.children.map((entry) => entry.element.id)).toEqual(
      result.strokes.map((_, index) => `stroke${index + 1}`)
    );
    const steps = child(strokes.children[0], 'steps');
    expect(steps.children.length).toBe(result.strokes[0].steps.length);
  });

  it('nests every link under its parent when parsed (issue 7)', () => {
    const lino = vectorizeShape('tee', { penLifts: false }).lino;
    const [document] = new Parser().parse(lino);
    const ids = document.values.map((link) => link.id);

    expect(document.id).toBe('vectorization');
    expect(ids.includes('network')).toBe(true);
    expect(ids.includes('strokes')).toBe(true);
    expect(lino.includes('    stroke1:\n      points (')).toBe(true);
    expect(lino.includes('        l')).toBe(true);
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
  it('names the result a stroke network of points and links (issue 7)', () => {
    const result = vectorizeShape('six');
    const json = JSON.parse(JSON.stringify(result));
    const [step] = result.strokes[0].steps;

    expect(result.network.points.length > 0).toBe(true);
    expect(result.network.links.length).toBe(result.links.links().length);
    expect(json.graph).toBe(undefined);
    expect(json.coverage.edges).toBe(undefined);
    expect(json.strokes[0].steps[0].edge).toBe(undefined);
    expect(json.strokes[0].steps[0].link).toBe(step.link);
    // Deprecated names from before issue 7 still read the same data.
    expect(result.graph.nodes).toBe(result.network.points);
    expect(result.graph.edges).toBe(result.network.links);
    expect(result.coverage.edges).toBe(result.coverage.links);
    expect(step.edge).toBe(step.link);
    expect(result.links.edges()).toEqual(result.links.links());
  });

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
    expect(store.links()).toEqual([]);
  });

  it('plans an Euler trail over a hand-built network', () => {
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
    expect(retraced.map((step) => step.link)).toEqual([stem]);
  });
});
