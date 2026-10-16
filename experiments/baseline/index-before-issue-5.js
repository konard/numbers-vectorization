const DEFAULT_THRESHOLD = 32;
const DEFAULT_ALPHA_THRESHOLD = 64;
const DEFAULT_SIMPLIFY_TOLERANCE = 0.85;
const NEIGHBOR_OFFSETS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

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

function assertRasterShape(raster) {
  if (!raster || !Number.isInteger(raster.width) || raster.width <= 0) {
    throw new TypeError('Raster width must be a positive integer.');
  }

  if (!Number.isInteger(raster.height) || raster.height <= 0) {
    throw new TypeError('Raster height must be a positive integer.');
  }

  const pixels = raster.pixels ?? raster.data;

  if (!pixels || typeof pixels.length !== 'number') {
    throw new TypeError('Raster pixels must be an array or typed array.');
  }

  const pixelCount = raster.width * raster.height;

  if (pixels.length !== pixelCount && pixels.length !== pixelCount * 4) {
    throw new RangeError(
      `Raster pixels length must be ${pixelCount} or ${pixelCount * 4}.`
    );
  }

  return pixels;
}

function shouldUseLightForeground(options) {
  return options.foreground === 'light';
}

function isPixelActive(value, options) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  if (options.foreground === 'dark') {
    return value <= threshold;
  }

  return value >= threshold;
}

function isRgbaPixelActive(pixels, offset, options) {
  const alpha = pixels[offset + 3] ?? 255;
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;

  if (alpha < alphaThreshold) {
    return false;
  }

  const red = pixels[offset] ?? 0;
  const green = pixels[offset + 1] ?? red;
  const blue = pixels[offset + 2] ?? red;
  const luminance = (red + green + blue) / 3;
  const threshold = options.threshold ?? 224;

  if (shouldUseLightForeground(options)) {
    return luminance >= threshold;
  }

  return luminance <= threshold;
}

/**
 * Convert a grayscale, binary, or RGBA raster into a 0/1 foreground mask.
 *
 * One-channel rasters use non-zero, light-on-dark semantics by default because
 * MNIST stores digits as bright pixels on a dark background. RGBA rasters use
 * dark-stroke semantics by default because browser pencil input is normally
 * rasterized as dark ink on transparent canvas.
 *
 * @param {{ width: number, height: number, pixels?: ArrayLike<number>,
 * data?: ArrayLike<number> }} raster - Raster image data.
 * @param {{ threshold?: number, alphaThreshold?: number,
 * foreground?: 'dark' | 'light' }} [options] - Thresholding options.
 * @returns {Uint8Array} Binary mask in row-major order.
 */
export function rasterToMask(raster, options = {}) {
  const pixels = assertRasterShape(raster);
  const pixelCount = raster.width * raster.height;
  const mask = new Uint8Array(pixelCount);

  if (pixels.length === pixelCount * 4) {
    for (let index = 0; index < pixelCount; index += 1) {
      mask[index] = isRgbaPixelActive(pixels, index * 4, options) ? 1 : 0;
    }

    return mask;
  }

  for (let index = 0; index < pixelCount; index += 1) {
    mask[index] = isPixelActive(pixels[index], options) ? 1 : 0;
  }

  return mask;
}

function get(mask, width, x, y) {
  return mask[y * width + x];
}

function paddedMask(mask, width, height) {
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const padded = new Uint8Array(paddedWidth * paddedHeight);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      padded[(y + 1) * paddedWidth + x + 1] = mask[y * width + x];
    }
  }

  return { mask: padded, width: paddedWidth, height: paddedHeight };
}

function cropMask(mask, width, height) {
  const croppedWidth = width - 2;
  const croppedHeight = height - 2;
  const cropped = new Uint8Array(croppedWidth * croppedHeight);

  for (let y = 0; y < croppedHeight; y += 1) {
    for (let x = 0; x < croppedWidth; x += 1) {
      cropped[y * croppedWidth + x] = mask[(y + 1) * width + x + 1];
    }
  }

  return cropped;
}

function neighborValues(mask, width, x, y) {
  return NEIGHBOR_OFFSETS.map(([dx, dy]) => get(mask, width, x + dx, y + dy));
}

function countForegroundNeighbors(values) {
  return values.reduce((count, value) => count + value, 0);
}

function countZeroToOneTransitions(values) {
  let transitions = 0;

  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    const next = values[(index + 1) % values.length];

    if (current === 0 && next === 1) {
      transitions += 1;
    }
  }

  return transitions;
}

function collectZhangSuenRemovals(mask, width, height, step) {
  const removals = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (get(mask, width, x, y) === 0) {
        continue;
      }

      const values = neighborValues(mask, width, x, y);
      const neighbors = countForegroundNeighbors(values);

      if (neighbors < 2 || neighbors > 6) {
        continue;
      }

      if (countZeroToOneTransitions(values) !== 1) {
        continue;
      }

      const [p2, , p4, , p6, , p8] = values;
      const firstPass = p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0;
      const secondPass = p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;

      if ((step === 0 && firstPass) || (step === 1 && secondPass)) {
        removals.push(y * width + x);
      }
    }
  }

  return removals;
}

/**
 * Thin a binary mask to a one-pixel centerline with the Zhang-Suen algorithm.
 *
 * @param {Uint8Array} mask - Binary mask in row-major order.
 * @param {number} width - Raster width.
 * @param {number} height - Raster height.
 * @returns {Uint8Array} Skeletonized mask.
 */
export function thinRasterMask(mask, width, height) {
  const padded = paddedMask(mask, width, height);
  let changed = true;

  while (changed) {
    changed = false;

    for (let step = 0; step < 2; step += 1) {
      const removals = collectZhangSuenRemovals(
        padded.mask,
        padded.width,
        padded.height,
        step
      );

      if (removals.length > 0) {
        changed = true;
        removals.forEach((index) => {
          padded.mask[index] = 0;
        });
      }
    }
  }

  return cropMask(padded.mask, padded.width, padded.height);
}

function activeIndices(mask) {
  const indices = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) {
      indices.push(index);
    }
  }

  return indices;
}

function validNeighborIndices(mask, width, height, index) {
  const x = index % width;
  const y = Math.floor(index / width);
  const neighbors = [];

  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const neighborX = x + dx;
    const neighborY = y + dy;

    if (
      neighborX >= 0 &&
      neighborX < width &&
      neighborY >= 0 &&
      neighborY < height
    ) {
      const neighborIndex = neighborY * width + neighborX;

      if (mask[neighborIndex] === 1) {
        neighbors.push(neighborIndex);
      }
    }
  }

  return neighbors;
}

function buildGraph(mask, width, height) {
  const indices = activeIndices(mask);
  const graph = new Map();

  indices.forEach((index) => {
    graph.set(index, validNeighborIndices(mask, width, height, index));
  });

  return graph;
}

function breadthFirstSearch(graph, start) {
  const queue = [start];
  const distances = new Map([[start, 0]]);
  const previous = new Map();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const nextDistance = distances.get(current) + 1;

    for (const neighbor of graph.get(current) ?? []) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, nextDistance);
        previous.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  return { distances, previous };
}

function findFarthest(distances, candidates) {
  let farthest = candidates[0];
  let farthestDistance = -1;

  for (const candidate of candidates) {
    const distance = distances.get(candidate);

    if (distance !== undefined && distance > farthestDistance) {
      farthest = candidate;
      farthestDistance = distance;
    }
  }

  return { index: farthest, distance: farthestDistance };
}

function traceIndexPath(previous, start, end) {
  const path = [end];
  let current = end;

  while (current !== start && previous.has(current)) {
    current = previous.get(current);
    path.push(current);
  }

  if (path.at(-1) !== start) {
    return [];
  }

  return path.reverse();
}

function findLongestEndpointPath(graph) {
  const nodes = [...graph.keys()];

  if (nodes.length === 0) {
    return [];
  }

  const endpoints = nodes.filter(
    (index) => (graph.get(index) ?? []).length <= 1
  );
  const candidates = endpoints.length >= 2 ? endpoints : nodes;
  let bestStart = candidates[0];
  let bestEnd = candidates[0];
  let bestDistance = 0;
  let bestPrevious = new Map();

  for (const candidate of candidates) {
    const search = breadthFirstSearch(graph, candidate);
    const farthest = findFarthest(search.distances, candidates);

    if (farthest.distance > bestDistance) {
      bestStart = candidate;
      bestEnd = farthest.index;
      bestDistance = farthest.distance;
      bestPrevious = search.previous;
    }
  }

  return traceIndexPath(bestPrevious, bestStart, bestEnd);
}

function indexToPoint(index, width) {
  return {
    x: (index % width) + 0.5,
    y: Math.floor(index / width) + 0.5,
  };
}

function foregroundPoints(mask, width) {
  const points = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) {
      points.push(indexToPoint(index, width));
    }
  }

  return points;
}

function extendEndpoint(endpoint, neighbor, candidates) {
  const dx = endpoint.x - neighbor.x;
  const dy = endpoint.y - neighbor.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return endpoint;
  }

  const ux = dx / length;
  const uy = dy / length;
  const maxPerpendicularDistance = 2;
  let bestPoint = endpoint;
  let bestProjection = 0;

  for (const candidate of candidates) {
    const candidateDx = candidate.x - endpoint.x;
    const candidateDy = candidate.y - endpoint.y;
    const projection = candidateDx * ux + candidateDy * uy;

    if (projection <= bestProjection) {
      continue;
    }

    const perpendicularDistance = Math.abs(candidateDx * uy - candidateDy * ux);

    if (perpendicularDistance <= maxPerpendicularDistance) {
      bestPoint = candidate;
      bestProjection = projection;
    }
  }

  return bestPoint;
}

function extendPathToMask(points, mask, width) {
  if (points.length < 2) {
    return points;
  }

  const candidates = foregroundPoints(mask, width);
  const extended = [...points];
  extended[0] = extendEndpoint(points[0], points[1], candidates);
  extended[extended.length - 1] = extendEndpoint(
    points.at(-1),
    points.at(-2),
    candidates
  );

  return extended;
}

function pointLineDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
    )
  );
  const projectedX = start.x + ratio * dx;
  const projectedY = start.y + ratio * dy;

  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

/**
 * Simplify a polyline using the Ramer-Douglas-Peucker algorithm.
 *
 * @param {{ x: number, y: number }[]} points - Polyline points.
 * @param {number} tolerance - Maximum point-to-segment error.
 * @returns {{ x: number, y: number }[]} Simplified points.
 */
export function simplifyPolyline(
  points,
  tolerance = DEFAULT_SIMPLIFY_TOLERANCE
) {
  if (points.length <= 2 || tolerance <= 0) {
    return [...points];
  }

  let maxDistance = -1;
  let splitIndex = -1;
  const start = points[0];
  const end = points.at(-1);

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(points[index], start, end);

    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }

  if (maxDistance <= tolerance) {
    return [start, end];
  }

  const left = simplifyPolyline(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyPolyline(points.slice(splitIndex), tolerance);

  return left.slice(0, -1).concat(right);
}

function turnAngle(previous, current, next) {
  const ax = current.x - previous.x;
  const ay = current.y - previous.y;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);

  if (aLength === 0 || bLength === 0) {
    return 0;
  }

  const cosine = Math.max(
    -1,
    Math.min(1, (ax * bx + ay * by) / (aLength * bLength))
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

function simplifyCenterline(points, tolerance) {
  if (points.length <= 2) {
    return [...points];
  }

  const cornerIndices = [0];

  for (let index = 1; index < points.length - 1; index += 1) {
    if (turnAngle(points[index - 1], points[index], points[index + 1]) >= 40) {
      cornerIndices.push(index);
    }
  }

  cornerIndices.push(points.length - 1);

  const simplified = [];

  for (let index = 1; index < cornerIndices.length; index += 1) {
    const start = cornerIndices[index - 1];
    const end = cornerIndices[index];
    const segment = simplifyPolyline(points.slice(start, end + 1), tolerance);

    simplified.push(...(index === 1 ? segment : segment.slice(1)));
  }

  return simplified;
}

function polylineLength(points) {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    );
  }

  return length;
}

function roundNumber(value) {
  return Number.parseFloat(value.toFixed(3));
}

function formatNumber(value) {
  return String(roundNumber(value));
}

function estimateStrokeWidth(mask, points) {
  const area = mask.reduce((sum, value) => sum + value, 0);

  if (area === 0) {
    return 1;
  }

  const length = polylineLength(points);
  const estimated = length > 0 ? area / length : Math.sqrt(area);

  return Math.max(1, roundNumber(estimated));
}

function pointsToSvgPath(points) {
  if (points.length === 0) {
    return '';
  }

  const [first, ...rest] = points;
  const commands = [`M ${formatNumber(first.x)} ${formatNumber(first.y)}`];

  rest.forEach((point) => {
    commands.push(`L ${formatNumber(point.x)} ${formatNumber(point.y)}`);
  });

  return commands.join(' ');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Build a standalone SVG document from vectorization output.
 *
 * @param {{ width: number, height: number, path: string,
 * strokeWidth: number }} result - Output from vectorizeRasterLine.
 * @param {{ title?: string, stroke?: string, className?: string }} [options]
 * - SVG presentation options.
 * @returns {string} SVG document string.
 */
export function createSvgDocument(result, options = {}) {
  const title = options.title
    ? `<title>${escapeXml(options.title)}</title>`
    : '';
  const className = options.className
    ? ` class="${escapeXml(options.className)}"`
    : '';
  const stroke = escapeXml(options.stroke ?? '#111827');
  const path = result.path
    ? `<path d="${escapeXml(result.path)}" fill="none" stroke="${stroke}" stroke-width="${formatNumber(
        result.strokeWidth
      )}" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';

  return `<svg${className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatNumber(
    result.width
  )} ${formatNumber(result.height)}" role="img">${title}${path}</svg>`;
}

/**
 * Reconstruct a single handwritten raster stroke as an SVG centerline path.
 *
 * The pipeline is intentionally CPU-only and deterministic: threshold pixels
 * into a mask, thin the mask to a skeleton, choose the longest endpoint path in
 * the skeleton graph, simplify that path, then render it with an estimated
 * stroke width.
 *
 * @param {{ width: number, height: number, pixels?: ArrayLike<number>,
 * data?: ArrayLike<number> }} raster - Raster image data.
 * @param {{ threshold?: number, alphaThreshold?: number,
 * foreground?: 'dark' | 'light', simplifyTolerance?: number,
 * strokeWidth?: number }} [options] - Vectorization options.
 * @returns {{ width: number, height: number, mask: Uint8Array,
 * skeleton: Uint8Array, points: { x: number, y: number }[], path: string,
 * strokeWidth: number, svg: string }}
 */
export function vectorizeRasterLine(raster, options = {}) {
  const mask = rasterToMask(raster, options);
  const skeleton = thinRasterMask(mask, raster.width, raster.height);
  const graph = buildGraph(skeleton, raster.width, raster.height);
  const pathIndices = findLongestEndpointPath(graph);
  const skeletonPoints = pathIndices.map((index) =>
    indexToPoint(index, raster.width)
  );
  const rawPoints = extendPathToMask(skeletonPoints, mask, raster.width);
  const points = simplifyCenterline(
    rawPoints,
    options.simplifyTolerance ?? DEFAULT_SIMPLIFY_TOLERANCE
  );
  const path = pointsToSvgPath(points);
  const strokeWidth =
    options.strokeWidth ?? estimateStrokeWidth(mask, rawPoints);
  const result = {
    width: raster.width,
    height: raster.height,
    mask,
    skeleton,
    points,
    path,
    strokeWidth,
    svg: '',
  };

  result.svg = createSvgDocument(result);

  return result;
}

export const rasterToSvgPath = vectorizeRasterLine;
