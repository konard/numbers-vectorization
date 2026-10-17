import { completeCoverage } from './completion.js';
import { continuationReach, DEFAULT_PEN_LIFT_COST } from './continuation.js';
import { measureCoverage } from './coverage.js';
import { distanceToBackground } from './distance.js';
import { polylineLength, roundNumber, simplifyPolyline } from './geometry.js';
import { toLinksNotation } from './links-notation.js';
import { LinksStore } from './links-store.js';
import { fillSmallHoles, labelComponents, rasterToMask } from './raster.js';
import {
  buildStrokeGraph,
  estimateSkeletonStrokeWidth,
  skeletonNeighbors,
} from './stroke-graph.js';
import { budgetPolylines, simplifyShapes } from './simplification.js';
import { createSvgDocument, strokesToSvgPath } from './svg.js';
import { thinRasterMask } from './thinning.js';
import { planStrokes, strokePoints } from './traversal.js';

const DEFAULT_HOLE_AREA = 2;

/**
 * Example function retained for compatibility with earlier template examples.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
export const add = (a, b) => a + b;

/**
 * Example function retained for compatibility with earlier template examples.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Product of a and b
 */
export const multiply = (a, b) => a * b;

/**
 * Example async function retained for compatibility with earlier template
 * examples.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export const delay = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

export {
  budgetPolylines,
  createSvgDocument,
  fillSmallHoles,
  labelComponents,
  LinksStore,
  measureCoverage,
  planStrokes,
  rasterToMask,
  simplifyPolyline,
  skeletonNeighbors,
  strokesToSvgPath,
  thinRasterMask,
  toLinksNotation,
};

function estimateStrokeWidth(mask, length) {
  const area = mask.reduce((sum, value) => sum + value, 0);

  if (area === 0) {
    return 1;
  }

  const estimated = length > 0 ? area / length : Math.sqrt(area);

  return Math.max(1, roundNumber(estimated));
}

function describeGraph(store) {
  return {
    nodes: store.points().map((id) => {
      const { x, y, pixels } = store.getData(id);
      return {
        id,
        x: roundNumber(x),
        y: roundNumber(y),
        degree: store.degree(id),
        pixels: [...pixels],
      };
    }),
    edges: store.edges().map((id) => {
      const { source, target } = store.get(id);
      const data = store.getData(id);
      return {
        id,
        source,
        target,
        length: roundNumber(data.length),
        points: data.simplified,
        pixels: [...data.pixels],
        completed: Boolean(data.completed),
        folded: Boolean(data.folded),
      };
    }),
  };
}

function describeStroke(store, stroke, points) {
  const retraceLength = stroke.steps
    .filter((step) => step.retrace)
    .reduce((sum, step) => sum + store.getData(step.edge).length, 0);

  return {
    start: stroke.start,
    points,
    steps: stroke.steps,
    length: roundNumber(polylineLength(points)),
    retraceLength: roundNumber(retraceLength),
  };
}

function edgeCoverage(store, strokes) {
  const walked = new Set(
    strokes.flatMap((stroke) => stroke.steps.map((step) => step.edge))
  );
  const edges = store.edges();

  return {
    total: edges.length,
    traversed: edges.filter((edge) => walked.has(edge)).length,
  };
}

/**
 * Vectorize a raster of handwriting into SVG pen strokes.
 *
 * The pipeline is CPU-only and deterministic:
 *
 * 1. threshold pixels into a mask and fill pinholes;
 * 2. thin the mask to a one-pixel skeleton (Zhang-Suen);
 * 3. convert the skeleton into a stroke graph of endpoints, junctions and
 *    branches stored as doublet links, then prune spurs, contract junction
 *    clusters and extend stroke ends back to the ink boundary;
 * 4. plan one pen stroke per connected component with route inspection
 *    (Chinese postman) and Fleury's algorithm, so that every branch, loop and
 *    dead end is drawn, retracing (U-turning over) as little as possible;
 * 5. simplify each shape with the fewest points that still explain its ink
 *    (or within a point budget) and serialize the strokes as SVG subpaths.
 *
 * @param {{ width: number, height: number, pixels?: ArrayLike<number>,
 * data?: ArrayLike<number> }} raster - Raster image data.
 * @param {{ threshold?: number, alphaThreshold?: number,
 * foreground?: 'dark' | 'light', simplifyTolerance?: number | 'auto',
 * pointCost?: number, maxPoints?: number, strokeWidth?: number,
 * fillHoles?: number, curve?: 'linear' | 'smooth', lookAhead?: number,
 * penLifts?: boolean, penLiftCost?: number }} [options] -
 * Vectorization options.
 * @returns {import('./index.d.ts').VectorizationResult} Vectorization result.
 */
export function vectorizeRasterLine(raster, options = {}) {
  const { width, height } = raster;
  const rawMask = rasterToMask(raster, options);
  const mask = fillSmallHoles(
    rawMask,
    width,
    height,
    options.fillHoles ?? DEFAULT_HOLE_AREA
  );
  const skeleton = thinRasterMask(mask, width, height);
  const distances = distanceToBackground(mask, width, height);
  const penWidth = estimateSkeletonStrokeWidth(skeleton, distances);
  const store = buildStrokeGraph({
    skeleton,
    mask,
    width,
    height,
    distances,
    strokeWidth: penWidth,
    trace: options.trace,
  });
  completeCoverage(store, {
    mask,
    width,
    height,
    distances,
    strokeWidth: penWidth,
  });
  options.trace?.('completed', store);
  const planned = planStrokes(store, {
    lookAhead: options.lookAhead,
    reach: continuationReach(penWidth),
    liftCost:
      options.penLifts === false
        ? Infinity
        : penWidth * (options.penLiftCost ?? DEFAULT_PEN_LIFT_COST),
  });
  const simplification = simplifyShapes(
    store,
    planned,
    { mask, width, height, penWidth },
    {
      tolerance: options.simplifyTolerance,
      pointCost: options.pointCost,
      maxPoints: options.maxPoints,
    }
  );
  // A point budget may drop the shortest strokes of a shape.
  const strokes = planned
    .map((stroke, index) => [stroke, simplification.points[index]])
    .filter(([, points]) => points !== null)
    .map(([stroke, points]) => describeStroke(store, stroke, points));
  const graphLength = store
    .edges()
    .reduce((sum, edge) => sum + store.getData(edge).length, 0);
  const strokeWidth =
    options.strokeWidth ?? estimateStrokeWidth(rawMask, graphLength);
  const strokePolylines = strokes.map((stroke) => stroke.points);
  const coverage = measureCoverage(
    { width, height, mask, skeleton, strokeWidth: penWidth },
    planned.map((stroke) => strokePoints(store, stroke))
  );
  const result = {
    width,
    height,
    mask: rawMask,
    skeleton,
    points: strokePolylines.flat(),
    strokes,
    path: strokesToSvgPath(strokePolylines, { curve: options.curve }),
    strokeWidth,
    graph: describeGraph(store),
    coverage: {
      ...coverage,
      edges: edgeCoverage(store, planned),
    },
    simplification: {
      tolerance: options.simplifyTolerance ?? 'auto',
      shapes: simplification.shapes,
    },
    links: store,
    svg: '',
    lino: '',
  };

  result.svg = createSvgDocument(result);
  result.lino = toLinksNotation(result);

  return result;
}

export const rasterToSvgPath = vectorizeRasterLine;
export const vectorizeRaster = vectorizeRasterLine;
