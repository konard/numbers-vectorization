import { angleBetween } from './geometry.js';

// Two links meeting at a node continue each other ("good continuation") when
// the pen would bend by at most this many degrees going from one to the other.
export const MAX_CONTINUATION_BEND = 30;
// A pen lift is worth retracing this many pen widths. The pen turns on the
// spot for a dead end that short (the middle arm of a 3, a jitter where thick
// ink blurs a junction) and keeps the stroke whole; the arm of a "+" or the
// bar of a "7" is long enough to be drawn as a stroke of its own.
export const DEFAULT_PEN_LIFT_COST = 2.5;

/** How far along a link its direction at a node is measured, in pixels. */
export function continuationReach(strokeWidth) {
  return Math.max(9, strokeWidth * 2);
}

/**
 * Direction in which a polyline leaves its first point, measured as the chord
 * to the point `reach` pixels along it, so the pixel staircase and the bulge
 * of thinning at a junction do not tilt it.
 */
export function endDirection(points, reach) {
  const origin = points[0];
  let walked = 0;
  let target = points.at(-1);

  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    walked += Math.hypot(
      points[index].x - before.x,
      points[index].y - before.y
    );
    target = points[index];

    if (walked >= reach) {
      break;
    }
  }

  return { x: target.x - origin.x, y: target.y - origin.y };
}

/**
 * The link ends meeting at `node`. A loop meets its node twice, once with
 * each end. `direction` points away from the node along the link.
 *
 * @returns {{ edge: number, end: 'source' | 'target',
 * direction: { x: number, y: number } }[]} Link ends.
 */
export function linkEnds(store, node, reach) {
  return store.incident(node).flatMap((edge) => {
    const { source, target } = store.get(edge);
    const { points } = store.getData(edge);
    const reversed = [...points].reverse();
    const ends = [];

    if (source === node) {
      ends.push({
        edge,
        end: 'source',
        direction: endDirection(points, reach),
      });
    }

    if (target === node) {
      ends.push({
        edge,
        end: 'target',
        direction: endDirection(reversed, reach),
      });
    }

    return ends;
  });
}

/** How far the pen bends passing from one link end into another (degrees). */
export function bend(first, second) {
  return 180 - angleBetween(first.direction, second.direction);
}

/**
 * Pair link ends that continue each other straight through their node,
 * straightest pairs first: the two lines of a "+" or an "x", the bar of a "T".
 *
 * @param {{ direction: { x: number, y: number } }[]} ends - Link ends.
 * @param {number} [maxBend] - Largest bend in degrees.
 * @returns {[number, number][]} Index pairs into `ends`.
 */
export function continuationPairs(ends, maxBend = MAX_CONTINUATION_BEND) {
  const candidates = [];

  ends.forEach((first, i) => {
    ends.slice(i + 1).forEach((second, offset) => {
      const angle = bend(first, second);

      if (angle <= maxBend) {
        candidates.push([angle, i, i + 1 + offset]);
      }
    });
  });

  const used = new Set();

  return candidates
    .sort((a, b) => a[0] - b[0])
    .filter(([, i, j]) => {
      if (used.has(i) || used.has(j)) {
        return false;
      }

      used.add(i);
      used.add(j);
      return true;
    })
    .map(([, i, j]) => [i, j]);
}
