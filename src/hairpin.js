import { polylineLength } from './geometry.js';

// A stroke counts as "fused" (two pen lines drawn side by side) when its ink
// is clearly wider than the median pen: 8% above the median medial radius and
// at least one whole pixel more, so the distance steps of thin strokes do not
// count as thickening.
const FUSED_THICKNESS = 1.08;
const FUSED_MARGIN = 1;
// Offsets are averaged over this many neighbouring points to calm the
// pixel-level noise of the distance transform.
const SMOOTHING = 2;
// Sampling step of the rays that measure how deep the ink is on each side.
const RAY_STEP = 0.5;

function distanceAt(point, input) {
  const { distances, width, height } = input;
  const x = Math.min(width - 1, Math.max(0, Math.floor(point.x)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(point.y)));

  return distances[y * width + x];
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Medial radius of a centreline pixel of the median pen stroke. */
function penRadius(input) {
  return input.strokeWidth / 2 + 0.25;
}

/** Whether the ink along `points` is wider than one pen line. */
function isFused(points, input) {
  const radii = points.map((point) => distanceAt(point, input));

  const radius = penRadius(input);
  const median = medianOf(radii);

  return median >= radius * FUSED_THICKNESS && median >= radius + FUSED_MARGIN;
}

/**
 * Unit normal pointing left of the heading at `index`. The heading is taken
 * over `reach` points on both sides, so the staircase of a pixel chain does
 * not make the offset passes zig-zag.
 */
function leftNormal(points, index, reach) {
  const before = points[Math.max(0, index - reach)];
  const after = points[Math.min(points.length - 1, index + reach)];
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;

  // Screen coordinates grow downwards, so "left of the heading" is (dy, -dx).
  return { x: dy / length, y: -dx / length };
}

/** Insert points so that no segment is longer than one pixel. */
function densify(points) {
  return points.flatMap((point, index) => {
    const next = points[index + 1];

    if (next === undefined) {
      return [point];
    }

    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(next.x - point.x, next.y - point.y))
    );

    return Array.from({ length: steps }, (_, step) => ({
      x: point.x + ((next.x - point.x) * step) / steps,
      y: point.y + ((next.y - point.y) * step) / steps,
    }));
  });
}

function arcLengths(points) {
  let walked = 0;

  return points.map((point, index) => {
    const before = points[Math.max(0, index - 1)];
    walked += Math.hypot(point.x - before.x, point.y - before.y);
    return walked;
  });
}

/**
 * How far `point` can move along `direction` while a pen of the median width
 * centred there still fits inside the ink, up to `limit`.
 */
function roomAlong(point, direction, input, limit) {
  const fits = input.strokeWidth / 2;
  let room = 0;

  for (let t = RAY_STEP; t <= limit; t += RAY_STEP) {
    const moved = {
      x: point.x + direction.x * t,
      y: point.y + direction.y * t,
    };

    if (distanceAt(moved, input) < fits) {
      break;
    }

    room = t;
  }

  return room;
}

function smoothed(values) {
  return values.map((_, index) => {
    const window = values.slice(
      Math.max(0, index - SMOOTHING),
      index + SMOOTHING + 1
    );
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

/**
 * How far the pass on one side (`sign` +1 = left, -1 = right of the spine)
 * may move away from the spine and keep the pen inside the ink. Each side is
 * measured on its own, because a loop whose lines meet at an angle fuses into
 * a wedge and thinning does not keep the spine in the middle of it; near a
 * free tip the room shrinks with the round end of the ink, so the passes turn
 * there. The offset is capped at the pen's reach so the two passes still
 * cover the ink between them, and grows from zero over one pen width from the
 * junction the passes hang from, so they leave it together.
 */
function sideOffsets(spine, normals, input, sign) {
  const reach = input.strokeWidth / 2 + Math.SQRT1_2;
  const walked = arcLengths(spine);
  const raw = spine.map((point, index) => {
    const direction = {
      x: normals[index].x * sign,
      y: normals[index].y * sign,
    };
    return roomAlong(point, direction, input, reach);
  });

  return smoothed(raw).map(
    (offset, index) => offset * Math.min(1, walked[index] / input.strokeWidth)
  );
}

function shift(spine, normals, offsets, sign) {
  return spine.map((point, index) => ({
    x: point.x + normals[index].x * offsets[index] * sign,
    y: point.y + normals[index].y * offsets[index] * sign,
  }));
}

/**
 * The two passes of a fused out-and-back stroke: `centreline` is walked away
 * from its base on the `side` (+1 = left of the heading, -1 = right) and back
 * on the other side, so the pair traces a narrow loop instead of one line
 * drawn twice.
 */
function hairpinPasses(centreline, input, side) {
  const spine = densify(centreline);
  const reach = Math.max(2, Math.round(input.strokeWidth / 2));
  const normals = spine.map((_, index) => leftNormal(spine, index, reach));
  const outward = sideOffsets(spine, normals, input, side);
  const inward = sideOffsets(spine, normals, input, -side);
  const out = shift(spine, normals, outward, side);
  const back = shift(spine, normals, inward, -side).reverse();

  return { out, back };
}

/** Whether every point keeps the pen's centre on ink. */
function onInk(points, input) {
  return points.every((point) => distanceAt(point, input) > 0);
}

function orientedPoints(store, edge, from) {
  const link = store.get(edge);
  const { points } = store.getData(edge);

  return link.source === from ? points : [...points].reverse();
}

function isLoop(store, edge) {
  const link = store.get(edge);
  return link.source === link.target;
}

/** +1 when `point` lies left of the heading `from -> to`, -1 otherwise. */
function sideOf(from, to, point) {
  const cross =
    (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);

  // With y growing downwards a negative cross product is on the left.
  return cross < 0 ? 1 : -1;
}

/**
 * Fold the stem of a lasso back into its loop. When a narrow loop is drawn
 * as "up, turn, down", its two lines fuse into one thick stroke before they
 * reach the crossing, so thinning yields a loop hanging from a short, thick
 * stem. The simplest explanation is one loop that leaves the crossing, turns
 * and comes back: the stem becomes the loop's two sides.
 */
export function collapseLassoStems(store, input) {
  for (const loop of store.links().filter((id) => isLoop(store, id))) {
    const node = store.get(loop).source;
    const incident = store.incident(node);
    const stem = incident.find((edge) => edge !== loop);
    const crossing = stem === undefined ? node : store.other(stem, node);

    if (
      incident.length !== 2 ||
      crossing === node ||
      store.degree(crossing) < 3
    ) {
      continue;
    }

    const stemData = store.getData(stem);
    const loopData = store.getData(loop);
    const spine = orientedPoints(store, stem, crossing);

    if (stemData.length >= loopData.length / 2 || !isFused(spine, input)) {
      continue;
    }

    const top = spine.at(-1);
    const heading = spine.at(-2) ?? spine[0];
    const departure = loopData.points[Math.min(2, loopData.points.length - 1)];
    const side = sideOf(heading, top, departure);
    const { out, back } = hairpinPasses(spine, input, side);
    const points = [...out, ...loopData.points.slice(1, -1), ...back];

    if (!onInk(points, input)) {
      continue;
    }

    store.update(loop, crossing, crossing);
    store.setData(loop, {
      pixels: [...stemData.pixels, ...loopData.pixels],
      points,
      length: polylineLength(points),
      folded: true,
    });
    store.delete(stem);
    store.delete(node);
  }
}

/**
 * Continue a spine past its end while the pen still fits in the ink, so the
 * passes turn where the pen turned and not where thinning gave up.
 */
function reachTip(spine, input) {
  const end = spine.at(-1);
  const back = Math.ceil(input.strokeWidth);
  const from = densify(spine).at(-1 - back) ?? spine[0];
  const length = Math.hypot(end.x - from.x, end.y - from.y);

  if (length === 0) {
    return spine;
  }

  const direction = {
    x: (end.x - from.x) / length,
    y: (end.y - from.y) / length,
  };
  const room = roomAlong(end, direction, input, input.strokeWidth * 2);

  return room > 0
    ? [
        ...spine,
        { x: end.x + direction.x * room, y: end.y + direction.y * room },
      ]
    : spine;
}

/**
 * Turn a thick dead-end branch into a narrow loop. A loop drawn as "up, turn,
 * down" whose lines are pressed into one blob thins to a single dead-end
 * branch; drawing that branch as one line walked twice leaves the sides of the
 * blob uncovered. When the branch's ink is wider than one pen line it is
 * explained as the loop it was: out on one side, back on the other, ending
 * where it started, so no retrace is needed either.
 */
export function foldFusedSpurs(store, input) {
  for (const edge of store.links()) {
    const { source, target } = store.get(edge);
    const tip = [source, target].find((node) => store.degree(node) === 1);
    const base = store.other(edge, tip ?? source);

    if (tip === undefined || store.degree(base) < 3) {
      continue;
    }

    const data = store.getData(edge);
    const spine = orientedPoints(store, edge, base);

    if (data.length < input.strokeWidth * 2 || !isFused(spine, input)) {
      continue;
    }

    const { out, back } = hairpinPasses(reachTip(spine, input), input, 1);
    const points = [...out, ...back.slice(1)];

    if (!onInk(points, input)) {
      continue;
    }

    store.update(edge, base, base);
    store.setData(edge, {
      ...data,
      points,
      length: polylineLength(points),
      folded: true,
    });
    store.delete(tip);
  }
}
