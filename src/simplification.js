import {
  DEFAULT_SIMPLIFY_TOLERANCE,
  distanceBetween,
  pointSegmentDistance,
  simplifyCenterline,
} from './geometry.js';
import { isReached, polylineSegments, segmentGrid } from './segment-grid.js';
import { connectedComponents, strokePoints } from './traversal.js';

// Automatic simplification adds a point only where it explains at least
// this many pen-width squares of ink: a point is worth one dab of the pen, so
// the simpler explanation wins unless it visibly misses the shape. Measured
// in pen widths, the trade-off is the same at every resolution.
export const DEFAULT_POINT_COST = 1;
// Tolerances tried per shape, from finer than a pixel staircase to a few pen
// widths (each step is about √2 times the previous one).
const TOLERANCE_LADDER = [
  0.5,
  DEFAULT_SIMPLIFY_TOLERANCE,
  1.2,
  1.7,
  2.4,
  3.4,
  4.8,
  6.8,
  9.6,
  13.6,
  19.2,
  27.2,
  38.4,
  54.4,
  76.8,
];

function boundingBox(polylines, margin, width, height) {
  const points = polylines.flat();
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    left: Math.max(0, Math.floor(Math.min(...xs) - margin)),
    top: Math.max(0, Math.floor(Math.min(...ys) - margin)),
    right: Math.min(width - 1, Math.ceil(Math.max(...xs) + margin)),
    bottom: Math.min(height - 1, Math.ceil(Math.max(...ys) + margin)),
  };
}

/** Pixels of `box` the pen reaches when drawn along `polylines`. */
function penPixels(polylines, box, input) {
  const { width, height, reach } = input;
  const grid = segmentGrid(polylineSegments(polylines), width, height, reach);
  const reached = new Set();

  for (let y = box.top; y <= box.bottom; y += 1) {
    for (let x = box.left; x <= box.right; x += 1) {
      if (isReached({ x: x + 0.5, y: y + 0.5 }, grid, reach)) {
        reached.add(y * width + x);
      }
    }
  }

  return reached;
}

/**
 * How well pen strokes along `polylines` match a shape: the ink the pen
 * paints (`hit`), the background it paints (`extra`) and the shape's ink it
 * misses (`missed`). The shape's ink is what its unsimplified strokes reach
 * (`ink`), so neighbouring shapes and specks no stroke explains are not
 * misses. `match` is the intersection over union of paint and ink.
 */
function measureFit(polylines, box, ink, input) {
  const painted = penPixels(polylines, box, input);
  let hit = 0;

  painted.forEach((index) => {
    hit += input.mask[index];
  });

  const extra = painted.size - hit;
  const missed = [...ink].filter((index) => !painted.has(index)).length;
  const union = hit + extra + missed;

  return {
    error: extra + missed,
    match: union === 0 ? 1 : hit / union,
  };
}

function countPoints(polylines) {
  return polylines.reduce((sum, points) => sum + points.length, 0);
}

/**
 * Choose the simplification of one shape. A manual tolerance is used as is;
 * otherwise every tolerance of the ladder is tried and the one with the
 * shortest description wins: pixels drawn wrong plus `pointCost` pen-width
 * squares per point (minimum description length).
 */
function tuneShape(strokes, input, options) {
  const box = boundingBox(strokes, input.reach + 1, input.width, input.height);
  const ink = new Set(
    [...penPixels(strokes, box, input)].filter((index) => input.mask[index])
  );
  const diagonal = Math.hypot(box.right - box.left, box.bottom - box.top);
  const tolerances =
    typeof options.tolerance === 'number'
      ? [options.tolerance]
      : TOLERANCE_LADDER.filter((t, index) => index === 0 || t <= diagonal);
  const pointArea = options.pointCost * input.penWidth ** 2;
  const levels = tolerances.map((tolerance) => {
    const polylines = strokes.map((points) =>
      simplifyCenterline(points, tolerance)
    );
    const fit = measureFit(polylines, box, ink, input);
    const points = countPoints(polylines);

    return {
      tolerance,
      polylines,
      points,
      cost: fit.error + points * pointArea,
    };
  });
  const chosen = levels.reduce((a, b) =>
    b.cost < a.cost || (b.cost === a.cost && b.points < a.points) ? b : a
  );

  return { ...chosen, box, ink };
}

/**
 * Point of the shape nearest its centre of mass along the strokes: where a
 * single dot explains the shape best.
 */
function centrePoint(polylines) {
  const points = polylines.flat();
  let total = 0;
  let x = 0;
  let y = 0;

  polylineSegments(polylines).forEach(([a, b]) => {
    const length = Math.max(distanceBetween(a, b), 1e-6);
    total += length;
    x += ((a.x + b.x) / 2) * length;
    y += ((a.y + b.y) / 2) * length;
  });

  const centre = { x: x / total, y: y / total };

  return points.reduce((a, b) =>
    distanceBetween(b, centre) < distanceBetween(a, centre) ? b : a
  );
}

function farthestPoint(points, from, to) {
  let index = -1;
  let distance = 0;

  for (let cursor = from + 1; cursor < to; cursor += 1) {
    const d = pointSegmentDistance(points[cursor], points[from], points[to]);

    if (d > distance) {
      distance = d;
      index = cursor;
    }
  }

  return { index, distance };
}

/**
 * Simplify the strokes of one shape to at most `maxPoints` points in total
 * with Douglas-Peucker run top-down over all strokes at once: the point
 * farthest from the current approximation of any stroke is added next. Only
 * the `keep` longest strokes are drawn (by default as many as the budget can
 * give both ends); the others are dropped. A budget of one point leaves a
 * single dot.
 *
 * @param {{ x: number, y: number }[][]} polylines - Stroke polylines.
 * @param {number} maxPoints - Point budget (at least 1).
 * @param {number} [keep] - How many of the longest strokes to keep.
 * @returns {({ x: number, y: number }[] | null)[]} Simplified polylines, or
 * `null` for dropped strokes.
 */
export function budgetPolylines(polylines, maxPoints, keep = Infinity) {
  const budget = Math.max(1, Math.floor(maxPoints));

  if (budget === 1) {
    const dot = centrePoint(polylines);
    const owner = polylines.findIndex((points) => points.includes(dot));
    return polylines.map((_, index) => (index === owner ? [dot] : null));
  }

  const ends = (points) => (points.length === 1 ? 1 : 2);
  const byLength = polylines
    .map((points, index) => ({ index, length: polylineLengthOf(points) }))
    .sort((a, b) => b.length - a.length || a.index - b.index);
  const kept = new Map();
  let left = budget;

  byLength.forEach(({ index }) => {
    const points = polylines[index];

    if (ends(points) <= left && kept.size < keep) {
      kept.set(index, new Set([0, points.length - 1]));
      left -= ends(points);
    }
  });

  const candidates = [...kept.keys()]
    .filter((index) => polylines[index].length > 2)
    .map((index) => ({
      stroke: index,
      from: 0,
      to: polylines[index].length - 1,
      ...farthestPoint(polylines[index], 0, polylines[index].length - 1),
    }));

  while (left > 0 && candidates.length > 0) {
    const top = candidates.reduce(
      (a, b, i) => (b.distance > candidates[a].distance ? i : a),
      0
    );
    const { stroke, from, to, index, distance } = candidates[top];
    candidates.splice(top, 1);

    if (index === -1 || distance <= 0) {
      continue;
    }

    kept.get(stroke).add(index);
    left -= 1;

    for (const [start, end] of [
      [from, index],
      [index, to],
    ]) {
      if (end - start > 1) {
        candidates.push({
          stroke,
          from: start,
          to: end,
          ...farthestPoint(polylines[stroke], start, end),
        });
      }
    }
  }

  return polylines.map((points, index) =>
    kept.has(index)
      ? [...kept.get(index)].sort((a, b) => a - b).map((i) => points[i])
      : null
  );
}

function polylineLengthOf(points) {
  return polylineSegments([points]).reduce(
    (sum, [a, b]) => sum + distanceBetween(a, b),
    0
  );
}

function roundScore(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Spend a point budget on a shape: try drawing only its longest stroke, then
 * the two longest, and so on, and keep whichever matches the ink best. A few
 * points spent on the corners of one stroke often explain more than the bare
 * ends of every stroke.
 */
function fitBudget(raw, budget, tuned, context) {
  const most = Math.max(1, Math.min(raw.length, Math.floor(budget / 2)));
  const fitError = (polylines) =>
    measureFit(
      polylines.filter((polyline) => polyline !== null),
      tuned.box,
      tuned.ink,
      context
    ).error;
  const candidates = [pruneToBudget(tuned.polylines, budget, fitError)];

  for (let keep = 1; keep <= most; keep += 1) {
    candidates.push(budgetPolylines(raw, budget, keep));
  }

  return candidates
    .map((polylines) => ({ polylines, error: fitError(polylines) }))
    .reduce((a, b) => (b.error < a.error ? b : a)).polylines;
}

/**
 * Bottom-up alternative to `budgetPolylines`: starting from the tuned
 * simplification, remove the point whose loss costs the least ink until the
 * budget is met. Removing a stroke's last point drops the stroke.
 */
function pruneToBudget(polylines, budget, fitError) {
  let current = polylines.map((points) => [...points]);

  while (countPoints(current.filter(Boolean)) > budget) {
    const options = current.flatMap((points, stroke) =>
      (points ?? []).map((_, index) => {
        const next = current.map((other, i) =>
          i === stroke ? other.filter((__, j) => j !== index) : other
        );
        next[stroke] = next[stroke].length === 0 ? null : next[stroke];
        return next;
      })
    );

    current = options
      .map((next) => ({ next, error: fitError(next) }))
      .reduce((a, b) => (b.error < a.error ? b : a)).next;
  }

  return current;
}

function shapeStrokes(store, strokes) {
  const shapeOf = new Map();
  const components = connectedComponents(store);

  components.forEach((component, index) =>
    component.nodes.forEach((node) => shapeOf.set(node, index))
  );

  return components.map((component, index) => ({
    ...component,
    members: strokes
      .map((stroke, order) => ({ stroke, order }))
      .filter(({ stroke }) => shapeOf.get(stroke.start) === index),
  }));
}

/**
 * Simplify every shape (connected component of the stroke network) of a
 * planned drawing on its own, so each is explained with the fewest points
 * that still match its ink. Whole strokes are simplified, so a stroke passing
 * straight through a junction needs no point there; corners and U-turns stay.
 * Also sets `simplified` on every edge (the network at the chosen tolerance).
 *
 * @param {import('./links-store.js').LinksStore} store - Stroke network.
 * @param {{ start: number, steps: object[] }[]} strokes - Planned strokes.
 * @param {{ mask: Uint8Array, width: number, height: number,
 * penWidth: number }} input - Ink mask and pen width.
 * @param {{ tolerance?: number | 'auto', pointCost?: number,
 * maxPoints?: number }} [options] - A fixed tolerance (in pixels) or `auto`,
 * the ink (in pen-width squares) a point must explain to be worth adding, and
 * a point budget per shape.
 * @returns {{ points: ({ x: number, y: number }[] | null)[],
 * shapes: { strokes: number[], tolerance: number, points: number,
 * match: number }[] }} Stroke points (`null` for strokes a point budget
 * dropped) and a report per shape.
 */
export function simplifyShapes(store, strokes, input, options = {}) {
  const settings = {
    tolerance: options.tolerance ?? 'auto',
    pointCost: options.pointCost ?? DEFAULT_POINT_COST,
  };
  const context = { ...input, reach: input.penWidth / 2 + Math.SQRT1_2 };
  const points = strokes.map(() => null);
  const shapes = shapeStrokes(store, strokes).map(({ edges, members }) => {
    const raw = members.map(({ stroke }) => strokePoints(store, stroke));
    const order = members.map((member) => member.order);

    if (edges.length === 0) {
      order.forEach((index, i) => {
        points[index] = raw[i];
      });
      return { strokes: order, tolerance: 0, points: 1, match: 1 };
    }

    const tuned = tuneShape(raw, context, settings);
    const budget = options.maxPoints;
    const drawn =
      budget !== undefined && tuned.points > budget
        ? fitBudget(raw, budget, tuned, context)
        : tuned.polylines;
    const kept = drawn.filter((polyline) => polyline !== null);

    edges.forEach((edge) => {
      const data = store.getData(edge);
      store.setData(edge, {
        ...data,
        simplified: simplifyCenterline(data.points, tuned.tolerance),
      });
    });
    order.forEach((index, i) => {
      points[index] = drawn[i];
    });

    return {
      strokes: order,
      tolerance: tuned.tolerance,
      points: countPoints(kept),
      match: roundScore(measureFit(kept, tuned.box, tuned.ink, context).match),
    };
  });

  return { points, shapes };
}
