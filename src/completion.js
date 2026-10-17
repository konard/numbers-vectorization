import { polylineLength } from './geometry.js';
import { labelComponents } from './raster.js';
import { isReached, segmentGrid } from './segment-grid.js';

const MAX_BRANCHES = 24;
// The simplest explanation wins: a completion branch is one more link, so it
// must explain most of the ink blob it reaches into (not a sliver along a
// thick stroke, which a perpendicular stub only nibbles at), and enough ink to
// be worth a link (half a pen-radius square).
const MIN_EXPLAINED_SHARE = 0.5;
const MIN_GAIN = 0.5;
// A corner shorter than this (in pixels) is a spike, drawn as a U-turn.
const MIN_CORNER_CUT = 2;
const STEPS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function pixelCenter(index, width) {
  return { x: (index % width) + 0.5, y: Math.floor(index / width) + 0.5 };
}

/** Binary min-heap of (priority, value) pairs kept in two parallel arrays. */
class MinHeap {
  constructor() {
    this.priorities = [];
    this.values = [];
  }

  get size() {
    return this.values.length;
  }

  swap(i, j) {
    const { priorities, values } = this;
    [priorities[i], priorities[j]] = [priorities[j], priorities[i]];
    [values[i], values[j]] = [values[j], values[i]];
  }

  push(priority, value) {
    const { priorities } = this;
    priorities.push(priority);
    this.values.push(value);
    let index = priorities.length - 1;

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (priorities[parent] <= priorities[index]) {
        break;
      }

      this.swap(parent, index);
      index = parent;
    }
  }

  pop() {
    const { priorities, values } = this;
    const top = [priorities[0], values[0]];
    const lastPriority = priorities.pop();
    const lastValue = values.pop();

    if (values.length > 0) {
      priorities[0] = lastPriority;
      values[0] = lastValue;
      let index = 0;

      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;

        if (left < values.length && priorities[left] < priorities[smallest]) {
          smallest = left;
        }

        if (right < values.length && priorities[right] < priorities[smallest]) {
          smallest = right;
        }

        if (smallest === index) {
          break;
        }

        this.swap(smallest, index);
        index = smallest;
      }
    }

    return top;
  }
}

function graphSegments(store, skip) {
  const segments = [];

  store.edges().forEach((edge) => {
    if (edge !== skip) {
      segments.push(...polylineSegments(store.getData(edge).points));
    }
  });

  store.points().forEach((node) => {
    if (store.incident(node).length === 0) {
      const { x, y } = store.getData(node);
      segments.push([
        { x, y },
        { x, y },
      ]);
    }
  });

  return segments;
}

function polylineSegments(points) {
  return points.slice(1).map((point, index) => [points[index], point]);
}

function uncoveredMask(store, input, reach, segments = graphSegments(store)) {
  const { mask, width, height } = input;
  const grid = segmentGrid(segments, width, height, reach);
  const uncovered = new Uint8Array(mask.length);

  for (let index = 0; index < mask.length; index += 1) {
    if (
      mask[index] === 1 &&
      !isReached(pixelCenter(index, width), grid, reach)
    ) {
      uncovered[index] = 1;
    }
  }

  return uncovered;
}

function graphAnchors(store, width) {
  const anchors = new Map();

  store.edges().forEach((edge) => {
    const { points } = store.getData(edge);

    points.forEach((point, index) => {
      if (index > 0 && index < points.length - 1) {
        anchors.set(Math.floor(point.y) * width + Math.floor(point.x), {
          edge,
          index,
        });
      }
    });
  });

  store.points().forEach((node) => {
    const { x, y } = store.getData(node);
    anchors.set(Math.floor(y) * width + Math.floor(x), { node });
  });

  return anchors;
}

/**
 * Multi-source Dijkstra through the ink from every pixel the stroke graph
 * already passes through. Stepping costs `length / distanceToBackground`, so
 * the cheapest routes hug the medial axis of the ink like a skeleton branch.
 */
function medialGeodesics(input, anchors) {
  const { mask, width, height, distances } = input;
  const cost = new Float64Array(mask.length).fill(Infinity);
  const previous = new Int32Array(mask.length).fill(-1);
  const heap = new MinHeap();

  for (const pixel of anchors.keys()) {
    if (mask[pixel] === 1) {
      cost[pixel] = 0;
      heap.push(0, pixel);
    }
  }

  while (heap.size > 0) {
    const [current, pixel] = heap.pop();

    if (current > cost[pixel]) {
      continue;
    }

    const x = pixel % width;
    const y = (pixel - x) / width;

    for (const [dx, dy, length] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      const next = ny * width + nx;

      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[next]) {
        continue;
      }

      const candidate = current + length / distances[next];

      if (candidate < cost[next]) {
        cost[next] = candidate;
        previous[next] = pixel;
        heap.push(candidate, next);
      }
    }
  }

  return { cost, previous };
}

function trimEnd(points, amount) {
  if (amount <= 0 || polylineLength(points) <= amount + 1) {
    return points;
  }

  const trimmed = [...points];
  let remaining = amount;

  while (trimmed.length > 2) {
    const last = trimmed.at(-1);
    const before = trimmed.at(-2);
    const length = Math.hypot(last.x - before.x, last.y - before.y);

    if (length > remaining) {
      const ratio = (length - remaining) / length;
      trimmed[trimmed.length - 1] = {
        x: before.x + (last.x - before.x) * ratio,
        y: before.y + (last.y - before.y) * ratio,
      };
      return trimmed;
    }

    remaining -= length;
    trimmed.pop();
  }

  return trimmed;
}

function nearestPixel(pixels, point, width) {
  let best = 0;

  pixels.forEach((pixel, index) => {
    const center = pixelCenter(pixel, width);
    const bestCenter = pixelCenter(pixels[best], width);

    if (
      Math.hypot(center.x - point.x, center.y - point.y) <
      Math.hypot(bestCenter.x - point.x, bestCenter.y - point.y)
    ) {
      best = index;
    }
  });

  return best;
}

function splitEdge(store, edge, index, width) {
  const { source, target } = store.get(edge);
  const data = store.getData(edge);
  const point = data.points[index];
  const pixel = nearestPixel(data.pixels, point, width);
  const node = store.createPoint({
    x: point.x,
    y: point.y,
    pixels: [data.pixels[pixel]],
  });
  const head = data.points.slice(0, index + 1);
  const tail = data.points.slice(index);

  store.update(edge, source, node);
  store.setData(edge, {
    pixels: data.pixels.slice(0, pixel + 1),
    points: head,
    length: polylineLength(head),
  });
  store.create(node, target, {
    pixels: data.pixels.slice(pixel),
    points: tail,
    length: polylineLength(tail),
  });

  return node;
}

function onInk(from, to, input, depth) {
  const { distances, width } = input;
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2)
  );

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.floor(from.x + ((to.x - from.x) * step) / steps);
    const y = Math.floor(from.y + ((to.y - from.y) * step) / steps);

    if (!(distances[y * width + x] >= depth)) {
      return false;
    }
  }

  return true;
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
 * The edge's polyline turned into a sharp corner at `tip`: the pen leaves the
 * edge `cut` pixels before the anchor, goes straight to the tip and rejoins
 * the edge `cut` pixels after it. The widest cut whose two straight lines
 * stay inside the ink wins, so the corner the skeleton rounded off (the top
 * of a 7, the apex of an A, the middle of a 3) is drawn as one sharp turn.
 */
function cornerPoints(points, index, tip, input, longest) {
  const walked = arcLengths(points);
  const depth = input.strokeWidth / 4;

  for (let cut = Math.ceil(longest); cut >= MIN_CORNER_CUT; cut -= 1) {
    const before = points.findLastIndex(
      (_, j) => j < index && walked[index] - walked[j] >= cut
    );
    const after = points.findIndex(
      (_, j) => j > index && walked[j] - walked[index] >= cut
    );
    const head = points[Math.max(0, before)];
    const tail = points.at(after);

    if (onInk(head, tip, input, depth) && onInk(tip, tail, input, depth)) {
      return [
        ...points.slice(0, Math.max(0, before) + 1),
        tip,
        ...(after === -1 ? [tail] : points.slice(after)),
      ];
    }
  }

  return undefined;
}

function countUncovered(store, input, skip, polylines) {
  const segments = [
    ...graphSegments(store, skip),
    ...polylines.flatMap(polylineSegments),
  ];
  const reach = input.strokeWidth / 2 + Math.SQRT1_2;

  return uncoveredMask(store, input, reach, segments).reduce(
    (sum, value) => sum + value,
    0
  );
}

/**
 * A corner is simpler than a dead-end branch (no new link, node or U-turn),
 * so it wins unless it leaves more ink unexplained than a link is worth: the
 * straight cut must not skip the ink the rounded edge passed through.
 */
function cornerExplains(store, anchor, corner, branch, input) {
  const { points } = store.getData(anchor.edge);
  const lost =
    countUncovered(store, input, anchor.edge, [corner]) -
    countUncovered(store, input, anchor.edge, [points, branch]);

  return lost < MIN_GAIN * (input.strokeWidth / 2) ** 2;
}

/** Branch points from the anchor to the tip pulled back inside the ink. */
function branchPoints(start, pixels, width, halfWidth) {
  const raw = [start, ...pixels.slice(1).map((p) => pixelCenter(p, width))];
  return trimEnd(raw, halfWidth - 0.5);
}

/**
 * Explain the missed ink at the end of `pixels`. When the branch would leave
 * an edge from its middle, the edge first tries to turn a sharp corner there;
 * otherwise the branch is a new dead-end link drawn with a U-turn.
 */
function attachBranch(store, anchor, pixels, input) {
  const { width, strokeWidth } = input;
  const halfWidth = strokeWidth / 2;

  if (anchor.edge !== undefined) {
    const data = store.getData(anchor.edge);
    const branch = branchPoints(
      data.points[anchor.index],
      pixels,
      width,
      halfWidth
    );
    const corner = cornerPoints(
      data.points,
      anchor.index,
      branch.at(-1),
      input,
      polylineLength(branch) + strokeWidth
    );

    if (
      corner !== undefined &&
      cornerExplains(store, anchor, corner, branch, input)
    ) {
      store.setData(anchor.edge, {
        ...data,
        points: corner,
        length: polylineLength(corner),
        cornered: true,
      });
      return;
    }
  }

  const node =
    anchor.node ?? splitEdge(store, anchor.edge, anchor.index, width);
  const { x, y } = store.getData(node);
  const points = branchPoints({ x, y }, pixels, width, halfWidth);
  const tip = points.at(-1);
  const tipNode = store.createPoint({
    x: tip.x,
    y: tip.y,
    pixels: [pixels.at(-1)],
    completed: true,
  });

  store.create(node, tipNode, {
    pixels,
    points,
    length: polylineLength(points),
    completed: true,
  });
}

function geodesicPath(previous, target) {
  const pixels = [target];

  while (previous[pixels.at(-1)] !== -1) {
    pixels.push(previous[pixels.at(-1)]);
  }

  return pixels.reverse();
}

/**
 * Share of an uncovered blob that the pen reaches along a branch. The branch
 * is a chain of adjacent pixels, so testing its pixel centers is enough.
 */
function explainedPixels(pixels, path, width, reach) {
  const centers = path.map((pixel) => pixelCenter(pixel, width));

  return pixels.filter((pixel) => {
    const { x, y } = pixelCenter(pixel, width);
    return centers.some((c) => Math.hypot(c.x - x, c.y - y) <= reach);
  }).length;
}

/**
 * Pick the largest uncovered blob that a worthwhile branch can reach: the
 * blob must contain ink missed by a clear margin, and the branch to its
 * farthest pixel must stay longer than half the pen radius once its tip is
 * pulled back inside the ink. Shorter branches only add a U-turn on the spot, which
 * is what the wide overlap of two crossing thick strokes would otherwise get.
 */
function pickBranch(components, deep, geodesics, width, halfWidth) {
  const { cost, previous } = geodesics;
  const minimum = Math.max(1, halfWidth / 2) + Math.max(0, halfWidth - 0.5);
  const candidates = components
    .filter(({ pixels }) => pixels.some((pixel) => deep[pixel] === 1))
    .sort((a, b) => b.pixels.length - a.pixels.length);

  for (const { pixels } of candidates) {
    const far = pixels.reduce((a, b) => (cost[b] > cost[a] ? b : a));

    if (!Number.isFinite(cost[far])) {
      continue;
    }

    const path = geodesicPath(previous, far);
    const length = polylineLength(path.map((p) => pixelCenter(p, width)));

    const gain = explainedPixels(pixels, path, width, halfWidth + Math.SQRT1_2);

    if (
      length >= minimum &&
      gain >= MIN_EXPLAINED_SHARE * pixels.length &&
      gain >= MIN_GAIN * halfWidth ** 2
    ) {
      return path;
    }
  }

  return undefined;
}

/**
 * Coverage-driven completion. Thinning erodes short, thick protrusions (the
 * middle arm of a "3", a blunt hook), so some ink is never reached by any
 * skeleton branch. Repeatedly find the largest blob of ink that the pen
 * misses by a clear margin and grow a medial branch into it from the nearest
 * point of the stroke graph. The new branch is a dead end, so the traversal
 * draws it with a U-turn.
 */
export function completeCoverage(store, input) {
  const { width, height, strokeWidth } = input;
  const halfWidth = strokeWidth / 2;
  const reach = halfWidth + Math.SQRT1_2;
  const depth = halfWidth + 1.5;

  for (let branch = 0; branch < MAX_BRANCHES; branch += 1) {
    const uncovered = uncoveredMask(store, input, reach);
    const deep = uncoveredMask(store, input, depth);
    const { components } = labelComponents(uncovered, width, height);
    const anchors = graphAnchors(store, width);
    const geodesics = medialGeodesics(input, anchors);
    const pixels = pickBranch(components, deep, geodesics, width, halfWidth);

    if (pixels === undefined) {
      return;
    }

    attachBranch(store, anchors.get(pixels[0]), pixels, input);
  }
}
