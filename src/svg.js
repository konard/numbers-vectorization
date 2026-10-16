import { formatNumber, turnAngle } from './geometry.js';

const SMOOTH_CORNER_ANGLE = 60;

function formatPoint(point) {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

function linearSubpath(points) {
  const [first, ...rest] = points;
  const tail = rest.length === 0 ? [first] : rest;

  return [
    `M ${formatPoint(first)}`,
    ...tail.map((point) => `L ${formatPoint(point)}`),
  ].join(' ');
}

function splitAtCorners(points) {
  const runs = [];
  let run = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    run.push(points[index]);

    if (
      index < points.length - 1 &&
      turnAngle(points[index - 1], points[index], points[index + 1]) >=
        SMOOTH_CORNER_ANGLE
    ) {
      runs.push(run);
      run = [points[index]];
    }
  }

  runs.push(run);
  return runs;
}

function catmullRomRun(run) {
  if (run.length < 3) {
    return run.slice(1).map((point) => `L ${formatPoint(point)}`);
  }

  const commands = [];

  for (let index = 0; index < run.length - 1; index += 1) {
    const previous = run[Math.max(0, index - 1)];
    const start = run[index];
    const end = run[index + 1];
    const next = run[Math.min(run.length - 1, index + 2)];
    const first = {
      x: start.x + (end.x - previous.x) / 6,
      y: start.y + (end.y - previous.y) / 6,
    };
    const second = {
      x: end.x - (next.x - start.x) / 6,
      y: end.y - (next.y - start.y) / 6,
    };

    commands.push(
      `C ${formatPoint(first)} ${formatPoint(second)} ${formatPoint(end)}`
    );
  }

  return commands;
}

function smoothSubpath(points) {
  if (points.length < 3) {
    return linearSubpath(points);
  }

  return [
    `M ${formatPoint(points[0])}`,
    ...splitAtCorners(points).flatMap(catmullRomRun),
  ].join(' ');
}

/**
 * Serialize strokes into SVG path data. Every stroke becomes its own subpath
 * (`M ...`). A single-point stroke (a dot) becomes a zero-length subpath,
 * which SVG renders as a round dot when `stroke-linecap="round"`.
 *
 * @param {{ x: number, y: number }[][]} strokes - Stroke polylines.
 * @param {{ curve?: 'linear' | 'smooth' }} [options] - Output style.
 * @returns {string} SVG path data.
 */
export function strokesToSvgPath(strokes, options = {}) {
  const subpath = options.curve === 'smooth' ? smoothSubpath : linearSubpath;

  return strokes
    .filter((points) => points.length > 0)
    .map((points) => subpath(points))
    .join(' ');
}

export function escapeXml(value) {
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
