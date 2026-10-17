import { formatNumber } from './geometry.js';

const INDENT = '  ';

function pointName(id) {
  return `p${id}`;
}

function linkName(id) {
  return `l${id}`;
}

function pointList(points) {
  return points
    .map((point) => `(${formatNumber(point.x)} ${formatNumber(point.y)})`)
    .join(' ');
}

function stepLine(step) {
  return `${linkName(step.link)} ${pointName(step.from)} ${pointName(step.to)}${
    step.retrace ? ' retrace' : ''
  }`;
}

/**
 * Write an indented tree of `[line, children]` entries.
 * @param {Array<string | [string, Array]>} entries - Lines and subtrees.
 * @param {number} depth - Current indentation level.
 * @returns {string[]} Indented lines.
 */
function indentTree(entries, depth = 0) {
  return entries.flatMap((entry) => {
    const [line, children = []] = Array.isArray(entry) ? entry : [entry];
    return [
      `${INDENT.repeat(depth)}${line}`,
      ...indentTree(children, depth + 1),
    ];
  });
}

function networkTree(network) {
  return [
    ...network.points.map(
      (point) =>
        `${pointName(point.id)}: point ${formatNumber(point.x)} ${formatNumber(point.y)}`
    ),
    ...network.links.map((link) => [
      `${linkName(link.id)}: link ${pointName(link.source)} ${pointName(link.target)}`,
      [`points ${pointList(link.points)}`],
    ]),
  ];
}

function strokeTree(stroke, index) {
  const steps =
    stroke.steps.length === 0
      ? [pointName(stroke.start)]
      : stroke.steps.map(stepLine);

  return [
    `stroke${index + 1}:`,
    [`points ${pointList(stroke.points)}`, ['steps:', steps]],
  ];
}

/**
 * Export a vectorization result as indented Links Notation
 * (https://github.com/link-foundation/links-notation), the structured form
 * also used by lino-objects-codec.
 *
 * The stroke network is written as named links: every point is a link with
 * its coordinates and every link between two points references them and
 * carries its pixel chain. Every pen stroke lists the points it draws and the
 * links it walks, in order, with the direction of travel and a `retrace`
 * marker for U-turn segments:
 *
 * ```
 * vectorization:
 *   raster 28 28
 *   pen 2.5
 *   network:
 *     p1: point 9.5 4.5
 *     p2: point 14.5 20.5
 *     l3: link p1 p2
 *       points (9.5 4.5) (12 9) (14.5 20.5)
 *   strokes:
 *     stroke1:
 *       points (9.5 4.5) (14.5 20.5) (9.5 4.5)
 *       steps:
 *         l3 p1 p2
 *         l3 p2 p1 retrace
 * ```
 *
 * A stroke that is a single dot has the point itself as its only step.
 *
 * @param {{ width: number, height: number, strokeWidth: number,
 * network: { points: object[], links: object[] }, strokes: object[] }}
 * result - Output from vectorizeRasterLine.
 * @returns {string} Links Notation document.
 */
export function toLinksNotation(result) {
  const tree = [
    [
      'vectorization:',
      [
        `raster ${result.width} ${result.height}`,
        `pen ${formatNumber(result.strokeWidth)}`,
        ['network:', networkTree(result.network)],
        ['strokes:', result.strokes.map(strokeTree)],
      ],
    ],
  ];

  return `${indentTree(tree).join('\n')}\n`;
}
