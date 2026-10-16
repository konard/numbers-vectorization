import { pointSegmentDistance, polylineLength } from './geometry.js';
import { labelComponents } from './raster.js';

const CELL_SIZE = 4;
const MAX_BRANCHES = 24;
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

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(priority, value) {
    const { items } = this;
    items.push([priority, value]);
    let index = items.length - 1;

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (items[parent][0] <= items[index][0]) {
        break;
      }

      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop() {
    const { items } = this;
    const top = items[0];
    const last = items.pop();

    if (items.length > 0) {
      items[0] = last;
      let index = 0;

      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;

        if (left < items.length && items[left][0] < items[smallest][0]) {
          smallest = left;
        }

        if (right < items.length && items[right][0] < items[smallest][0]) {
          smallest = right;
        }

        if (smallest === index) {
          break;
        }

        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }

    return top;
  }
}

function graphSegments(store) {
  const segments = [];

  store.edges().forEach((edge) => {
    const { points } = store.getData(edge);
    points.slice(1).forEach((point, index) => {
      segments.push([points[index], point]);
    });
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

/** Bucket segments into a coarse grid so distance queries stay local. */
function segmentGrid(segments, width, height, margin) {
  const columns = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const cells = Array.from({ length: columns * rows }, () => []);
  const clamp = (value, limit) => Math.max(0, Math.min(limit - 1, value));

  segments.forEach((segment) => {
    const [a, b] = segment;
    const left = clamp(
      Math.floor((Math.min(a.x, b.x) - margin) / CELL_SIZE),
      columns
    );
    const right = clamp(
      Math.floor((Math.max(a.x, b.x) + margin) / CELL_SIZE),
      columns
    );
    const top = clamp(
      Math.floor((Math.min(a.y, b.y) - margin) / CELL_SIZE),
      rows
    );
    const bottom = clamp(
      Math.floor((Math.max(a.y, b.y) + margin) / CELL_SIZE),
      rows
    );

    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        cells[row * columns + column].push(segment);
      }
    }
  });

  return { cells, columns };
}

function isReached(point, grid, reach) {
  const cell =
    Math.floor(point.y / CELL_SIZE) * grid.columns +
    Math.floor(point.x / CELL_SIZE);

  return grid.cells[cell].some(
    ([a, b]) => pointSegmentDistance(point, a, b) <= reach
  );
}

function uncoveredMask(store, input, reach) {
  const { mask, width, height } = input;
  const grid = segmentGrid(graphSegments(store), width, height, reach);
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

function attachBranch(store, anchor, pixels, width, halfWidth) {
  const node = anchor.node ?? splitEdge(store, anchor.edge, anchor.index);
  const { x, y } = store.getData(node);
  const raw = [{ x, y }, ...pixels.slice(1).map((p) => pixelCenter(p, width))];
  const points = trimEnd(raw, halfWidth - 0.5);
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

function pickTarget(components, deep, cost) {
  let best = null;

  for (const { pixels } of components) {
    if (!pixels.some((pixel) => deep[pixel] === 1)) {
      continue;
    }

    const far = pixels.reduce((a, b) => (cost[b] > cost[a] ? b : a));

    if (
      Number.isFinite(cost[far]) &&
      (best === null || pixels.length > best.size)
    ) {
      best = { pixel: far, size: pixels.length };
    }
  }

  return best?.pixel;
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
    const { cost, previous } = medialGeodesics(input, anchors);
    const target = pickTarget(components, deep, cost);

    if (target === undefined) {
      return;
    }

    const pixels = [target];

    while (previous[pixels.at(-1)] !== -1) {
      pixels.push(previous[pixels.at(-1)]);
    }

    pixels.reverse();
    attachBranch(store, anchors.get(pixels[0]), pixels, width, halfWidth);
  }
}
