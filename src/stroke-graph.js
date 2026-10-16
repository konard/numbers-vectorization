import { leavingDirection, polylineLength } from './geometry.js';
import { LinksStore } from './links-store.js';

const FOUR_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const DIAGONAL_OFFSETS = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
const EXTENSION_STEP = 0.25;

function isOn(skeleton, width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height
    ? skeleton[y * width + x] === 1
    : false;
}

/**
 * Neighbours of a skeleton pixel under m-adjacency (mixed adjacency): the four
 * edge neighbours always count, a diagonal neighbour only counts when the two
 * pixels it shares with the current pixel are both background. This removes
 * the redundant "triangle" links of 8-adjacency, so a one-pixel line has
 * exactly two neighbours per interior pixel and junctions are unambiguous.
 */
export function skeletonNeighbors(skeleton, width, height, index) {
  const x = index % width;
  const y = (index - x) / width;
  const neighbors = [];

  for (const [dx, dy] of FOUR_OFFSETS) {
    if (isOn(skeleton, width, height, x + dx, y + dy)) {
      neighbors.push((y + dy) * width + x + dx);
    }
  }

  for (const [dx, dy] of DIAGONAL_OFFSETS) {
    if (
      isOn(skeleton, width, height, x + dx, y + dy) &&
      !isOn(skeleton, width, height, x + dx, y) &&
      !isOn(skeleton, width, height, x, y + dy)
    ) {
      neighbors.push((y + dy) * width + x + dx);
    }
  }

  return neighbors;
}

function pixelCenter(index, width) {
  return { x: (index % width) + 0.5, y: Math.floor(index / width) + 0.5 };
}

function buildAdjacency(skeleton, width, height) {
  const adjacency = new Map();

  for (let index = 0; index < skeleton.length; index += 1) {
    if (skeleton[index] === 1) {
      adjacency.set(index, skeletonNeighbors(skeleton, width, height, index));
    }
  }

  return adjacency;
}

function clusterNodePixels(adjacency, width, store) {
  const clusterOf = new Map();

  for (const [index, neighbors] of adjacency) {
    if (neighbors.length === 2 || clusterOf.has(index)) {
      continue;
    }

    const pixels = [index];
    clusterOf.set(index, null);

    for (let cursor = 0; cursor < pixels.length; cursor += 1) {
      for (const neighbor of adjacency.get(pixels[cursor])) {
        if (adjacency.get(neighbor).length !== 2 && !clusterOf.has(neighbor)) {
          clusterOf.set(neighbor, null);
          pixels.push(neighbor);
        }
      }
    }

    const centers = pixels.map((pixel) => pixelCenter(pixel, width));
    const node = store.createPoint({
      x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length,
      y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length,
      pixels,
    });
    pixels.forEach((pixel) => clusterOf.set(pixel, node));
  }

  return clusterOf;
}

function createEdge(store, source, target, pixels, width) {
  const sourceData = store.getData(source);
  const targetData = store.getData(target);
  const inner = pixels.slice(1, -1).map((pixel) => pixelCenter(pixel, width));
  const points = [
    { x: sourceData.x, y: sourceData.y },
    ...inner,
    { x: targetData.x, y: targetData.y },
  ];

  return store.create(source, target, {
    pixels,
    points,
    length: polylineLength(points),
  });
}

function traceChain(adjacency, isNodePixel, visited, start, first) {
  const pixels = [start, first];
  let previous = start;
  let current = first;
  visited.add(first);

  while (!isNodePixel(current) && current !== start) {
    const next = adjacency.get(current).find((pixel) => pixel !== previous);
    previous = current;
    current = next;
    pixels.push(current);

    if (!isNodePixel(current)) {
      visited.add(current);
    }
  }

  return pixels;
}

function traceEdges(adjacency, clusterOf, width, store) {
  const visited = new Set();
  const isNodePixel = (pixel) => clusterOf.has(pixel);

  for (const pixel of clusterOf.keys()) {
    for (const neighbor of adjacency.get(pixel)) {
      if (isNodePixel(neighbor) || visited.has(neighbor)) {
        continue;
      }

      const pixels = traceChain(
        adjacency,
        isNodePixel,
        visited,
        pixel,
        neighbor
      );
      createEdge(
        store,
        clusterOf.get(pixel),
        clusterOf.get(pixels.at(-1)),
        pixels,
        width
      );
    }
  }

  // Whatever is left are closed one-pixel loops without any endpoint or
  // junction (the inside of a "0"). Anchor each loop at its first pixel in
  // scan order, i.e. its top-most, left-most pixel.
  for (const pixel of [...adjacency.keys()].sort((a, b) => a - b)) {
    if (isNodePixel(pixel) || visited.has(pixel)) {
      continue;
    }

    const center = pixelCenter(pixel, width);
    const node = store.createPoint({ ...center, pixels: [pixel] });
    visited.add(pixel);
    const pixels = traceChain(
      adjacency,
      (candidate) => candidate === pixel,
      visited,
      pixel,
      adjacency.get(pixel)[0]
    );
    createEdge(store, node, node, pixels, width);
  }
}

function orientedPoints(store, edge, from) {
  const link = store.get(edge);
  const { points } = store.getData(edge);

  return link.source === from ? points : [...points].reverse();
}

function setEdgeEnd(store, edge, node) {
  const link = store.get(edge);
  const data = store.getData(edge);
  const { x, y } = store.getData(node);
  const points = [...data.points];

  if (link.source === node) {
    points[0] = { x, y };
  }

  if (link.target === node) {
    points[points.length - 1] = { x, y };
  }

  store.setData(edge, { ...data, points, length: polylineLength(points) });
}

function isLoop(store, edge) {
  const link = store.get(edge);
  return link.source === link.target;
}

function nodeRadius(store, node, distances) {
  const { pixels } = store.getData(node);
  return Math.max(...pixels.map((pixel) => distances[pixel]));
}

/**
 * Remove short "spur" branches that thinning grows towards the corners of
 * thick strokes. A branch between an endpoint and a junction is a spur when
 * it does not reach meaningfully beyond the stroke body around the junction.
 * Only one pass is made so genuine short strokes are never eroded away.
 */
function pruneSpurs(store, options) {
  const spursByJunction = new Map();

  for (const edge of store.edges()) {
    if (isLoop(store, edge)) {
      continue;
    }

    const { source, target } = store.get(edge);
    const [tip, junction] =
      store.degree(source) === 1 ? [source, target] : [target, source];

    if (store.degree(tip) !== 1 || store.degree(junction) < 3) {
      continue;
    }

    const limit = Math.max(
      options.spurLength,
      nodeRadius(store, junction, options.distances)
    );

    if (store.getData(edge).length <= limit) {
      spursByJunction.set(junction, [
        ...(spursByJunction.get(junction) ?? []),
        edge,
      ]);
    }
  }

  for (const [junction, spurs] of spursByJunction) {
    const remaining = store.degree(junction) - spurs.length;
    const sorted = [...spurs].sort(
      (a, b) => store.getData(b).length - store.getData(a).length
    );
    const removable = remaining >= 1 ? sorted : sorted.slice(2);

    removable.forEach((edge) => {
      const tip = store.other(edge, junction);
      store.delete(edge);
      store.delete(tip);
    });
  }
}

function joinEdges(store, node, first, second) {
  const firstPoints = [...orientedPoints(store, first, node)].reverse();
  const secondPoints = orientedPoints(store, second, node);
  const start = store.other(first, node);
  const end = store.other(second, node);
  const points = [...firstPoints, ...secondPoints.slice(1)];
  const pixels = [
    ...store.getData(first).pixels,
    ...store.getData(second).pixels,
  ];

  store.update(first, start, end);
  store.setData(first, { pixels, points, length: polylineLength(points) });
  store.delete(second);
  store.delete(node);
}

/** Join the two branches of every degree-2 node into one edge. */
function mergeDegreeTwoNodes(store) {
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of store.points()) {
      const incident = store.incident(node);

      if (incident.length === 2 && store.degree(node) === 2) {
        joinEdges(store, node, incident[0], incident[1]);
        changed = true;
      }
    }
  }
}

function contractEdge(store, edge) {
  const { source: keep, target: drop } = store.get(edge);
  const keepData = store.getData(keep);
  const dropData = store.getData(drop);
  const keepWeight = keepData.pixels.length;
  const dropWeight = dropData.pixels.length;
  const total = keepWeight + dropWeight;

  store.delete(edge);
  store.setData(keep, {
    x: (keepData.x * keepWeight + dropData.x * dropWeight) / total,
    y: (keepData.y * keepWeight + dropData.y * dropWeight) / total,
    pixels: [...keepData.pixels, ...dropData.pixels],
  });

  for (const other of store.incident(drop)) {
    const link = store.get(other);
    store.update(
      other,
      link.source === drop ? keep : link.source,
      link.target === drop ? keep : link.target
    );
  }

  store.delete(drop);
  store.incident(keep).forEach((other) => setEdgeEnd(store, other, keep));
}

function findShortJunctionEdge(store, limit) {
  return store.edges().find((edge) => {
    const { source, target } = store.get(edge);

    return (
      source !== target &&
      store.degree(source) >= 3 &&
      store.degree(target) >= 3 &&
      store.getData(edge).length < limit
    );
  });
}

/**
 * Collapse junction clusters: thinning splits an "X" crossing into two
 * T-junctions a pixel or two apart, and leaves tiny loops around pinholes.
 */
function contractJunctions(store, options) {
  let edge = findShortJunctionEdge(store, options.junctionLength);

  while (edge !== undefined) {
    contractEdge(store, edge);
    edge = findShortJunctionEdge(store, options.junctionLength);
  }

  for (const loop of store.edges().filter((id) => isLoop(store, id))) {
    const node = store.get(loop).source;

    if (
      store.getData(loop).length < options.loopLength &&
      store.incident(node).length > 1
    ) {
      store.delete(loop);
    }
  }
}

function isForeground(mask, width, height, point) {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);

  return x >= 0 && y >= 0 && x < width && y < height
    ? mask[y * width + x] === 1
    : false;
}

/**
 * Thinning shortens every free stroke end by about half the stroke width.
 * March from the skeleton tip along the stroke tangent until the ink ends,
 * then back off by the pen radius so a round cap lands on the ink boundary.
 */
function extendEndpoints(store, options) {
  const { mask, width, height, halfWidth } = options;
  const maxDistance = options.strokeWidth + 2;

  for (const node of store.points()) {
    const incident = store.incident(node);

    if (incident.length !== 1 || store.degree(node) !== 1) {
      continue;
    }

    const points = orientedPoints(store, incident[0], node);
    const direction = leavingDirection(points, 3);
    const length = Math.hypot(direction.x, direction.y);

    if (length === 0) {
      continue;
    }

    const tip = points[0];
    const ux = -direction.x / length;
    const uy = -direction.y / length;
    let reach = 0;

    for (let t = EXTENSION_STEP; t <= maxDistance; t += EXTENSION_STEP) {
      if (
        !isForeground(mask, width, height, {
          x: tip.x + ux * t,
          y: tip.y + uy * t,
        })
      ) {
        break;
      }

      reach = t;
    }

    const extension = Math.max(0, reach + EXTENSION_STEP / 2 - halfWidth);

    if (extension > 0) {
      const data = store.getData(node);
      store.setData(node, {
        ...data,
        x: tip.x + ux * extension,
        y: tip.y + uy * extension,
        extended: extension,
      });
      setEdgeEnd(store, incident[0], node);
    }
  }
}

function medianOf(values) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Estimate the pen width from the distance transform sampled on the skeleton:
 * a centerline pixel of a stroke `w` pixels wide is about `(w + 1) / 2` pixels
 * from the background.
 */
export function estimateSkeletonStrokeWidth(skeleton, distances) {
  const samples = [];

  for (let index = 0; index < skeleton.length; index += 1) {
    if (skeleton[index] === 1) {
      samples.push(distances[index]);
    }
  }

  return samples.length === 0 ? 1 : Math.max(1, 2 * medianOf(samples) - 0.5);
}

/**
 * Turn a one-pixel skeleton into a stroke graph stored as doublet links.
 *
 * Nodes are endpoints, junctions, isolated dots and loop anchors; edges are
 * the pixel chains between them. The raw graph is then cleaned up: spurs are
 * pruned, short junction-to-junction links contracted, degree-2 nodes merged
 * and free stroke ends extended back to the ink boundary.
 *
 * @param {{ skeleton: Uint8Array, mask: Uint8Array, width: number,
 * height: number, distances: Float64Array, strokeWidth: number }} input -
 * Skeleton, source mask, distance transform and estimated pen width.
 * @returns {LinksStore} Stroke graph links.
 */
export function buildStrokeGraph(input) {
  const { skeleton, width, height, strokeWidth } = input;
  const store = new LinksStore();
  const adjacency = buildAdjacency(skeleton, width, height);
  const clusterOf = clusterNodePixels(adjacency, width, store);
  const halfWidth = strokeWidth / 2;

  // Optional tracing hook (off by default) used by experiments to inspect
  // every rewriting stage of the stroke graph.
  const trace = input.trace ?? (() => {});

  traceEdges(adjacency, clusterOf, width, store);
  trace('traced', store);
  pruneSpurs(store, {
    distances: input.distances,
    spurLength: halfWidth,
  });
  trace('pruned', store);
  mergeDegreeTwoNodes(store);
  contractJunctions(store, {
    junctionLength: Math.max(2, halfWidth),
    loopLength: Math.max(4, strokeWidth * 2),
  });
  mergeDegreeTwoNodes(store);
  trace('contracted', store);
  extendEndpoints(store, {
    mask: input.mask,
    width,
    height,
    strokeWidth,
    halfWidth,
  });
  trace('extended', store);

  return store;
}
