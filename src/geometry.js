export const DEFAULT_SIMPLIFY_TOLERANCE = 0.85;
const CORNER_ANGLE = 40;
const CORNER_SPAN = 3;

export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointSegmentDistance(point, start, end) {
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

export function polylineLength(points) {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += distanceBetween(points[index], points[index - 1]);
  }

  return length;
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
    const distance = pointSegmentDistance(points[index], start, end);

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

/**
 * Turning angle in degrees at `current` for the polyline previous → current →
 * next. Straight continuation is 0 and a full U-turn is 180.
 */
export function turnAngle(previous, current, next) {
  const ax = current.x - previous.x;
  const ay = current.y - previous.y;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  return angleBetween({ x: ax, y: ay }, { x: bx, y: by });
}

/**
 * Angle in degrees between two direction vectors (0 = same direction).
 */
export function angleBetween(a, b) {
  const aLength = Math.hypot(a.x, a.y);
  const bLength = Math.hypot(b.x, b.y);

  if (aLength === 0 || bLength === 0) {
    return 0;
  }

  const cosine = Math.max(
    -1,
    Math.min(1, (a.x * b.x + a.y * b.y) / (aLength * bLength))
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

function pointAtArc(points, index, step, span) {
  let travelled = 0;
  let cursor = index;

  while (cursor + step >= 0 && cursor + step < points.length) {
    travelled += distanceBetween(points[cursor], points[cursor + step]);
    cursor += step;

    if (travelled >= span) {
      break;
    }
  }

  return points[cursor];
}

/**
 * Turning angle at every point, measured between the chords to the points
 * `span` pixels before and after it. Unlike the angle between adjacent
 * pixels this ignores the 90-degree steps of pixel staircases.
 */
function chordAngles(points, span) {
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return 0;
    }

    return turnAngle(
      pointAtArc(points, index, -1, span),
      point,
      pointAtArc(points, index, 1, span)
    );
  });
}

/**
 * Corners are local maxima of the chord angle that reach `CORNER_ANGLE`.
 */
function findCorners(points, span) {
  const angles = chordAngles(points, span);
  const corners = [];

  angles.forEach((angle, index) => {
    if (angle < CORNER_ANGLE) {
      return;
    }

    const last = corners.at(-1);
    const near =
      last !== undefined &&
      polylineLength(points.slice(last, index + 1)) < span;

    if (!near) {
      corners.push(index);
    } else if (angle > angles[last]) {
      corners[corners.length - 1] = index;
    }
  });

  return corners;
}

/**
 * Simplify a centerline with RDP while keeping every sharp corner (turns of
 * at least 40 degrees over a `CORNER_SPAN` pixel window) as a fixed vertex, so
 * right angles survive simplification but pixel staircases do not.
 */
export function simplifyCenterline(points, tolerance) {
  if (points.length <= 2) {
    return [...points];
  }

  const cornerIndices = [0, ...findCorners(points, CORNER_SPAN)];
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

/**
 * Direction of a polyline leaving its first point, measured towards the point
 * that lies `lookAhead` units along the polyline. Using a look-ahead distance
 * instead of the adjacent pixel makes the tangent robust to pixel staircase
 * noise.
 */
export function leavingDirection(points, lookAhead = 3) {
  if (points.length < 2) {
    return { x: 0, y: 0 };
  }

  const origin = points[0];
  let travelled = 0;
  let target = points.at(-1);

  for (let index = 1; index < points.length; index += 1) {
    travelled += distanceBetween(points[index], points[index - 1]);
    target = points[index];

    if (travelled >= lookAhead) {
      break;
    }
  }

  return { x: target.x - origin.x, y: target.y - origin.y };
}

export function roundNumber(value) {
  return Number.parseFloat(value.toFixed(3));
}

export function formatNumber(value) {
  return String(roundNumber(value));
}
