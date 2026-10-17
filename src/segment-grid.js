import { pointSegmentDistance } from './geometry.js';

const CELL_SIZE = 4;

/**
 * Line segments of polylines. A one-point polyline (a dot) is a segment of
 * zero length.
 */
export function polylineSegments(polylines) {
  return polylines.flatMap((points) =>
    points.length === 1
      ? [[points[0], points[0]]]
      : points.slice(1).map((point, index) => [points[index], point])
  );
}

/**
 * Bucket line segments into a coarse grid so "is this point within `margin`
 * of the path?" queries only test nearby segments.
 *
 * @param {[{ x: number, y: number }, { x: number, y: number }][]} segments
 * @param {number} width - Raster width.
 * @param {number} height - Raster height.
 * @param {number} margin - Largest distance that will be queried.
 */
export function segmentGrid(segments, width, height, margin) {
  const columns = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const cells = Array.from({ length: columns * rows }, () => []);
  const clamp = (value, limit) => Math.max(0, Math.min(limit - 1, value));
  const cell = (value, limit) => clamp(Math.floor(value / CELL_SIZE), limit);

  segments.forEach((segment) => {
    const [a, b] = segment;
    const left = cell(Math.min(a.x, b.x) - margin, columns);
    const right = cell(Math.max(a.x, b.x) + margin, columns);
    const top = cell(Math.min(a.y, b.y) - margin, rows);
    const bottom = cell(Math.max(a.y, b.y) + margin, rows);

    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        cells[row * columns + column].push(segment);
      }
    }
  });

  return { cells, columns };
}

/** Whether `point` (inside the raster) lies within `reach` of a segment. */
export function isReached(point, grid, reach) {
  const cell =
    Math.floor(point.y / CELL_SIZE) * grid.columns +
    Math.floor(point.x / CELL_SIZE);

  return grid.cells[cell].some(
    ([a, b]) => pointSegmentDistance(point, a, b) <= reach
  );
}
