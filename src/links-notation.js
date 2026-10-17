import { formatNumber } from './geometry.js';

function nodeName(id) {
  return `n${id}`;
}

function edgeName(id) {
  return `e${id}`;
}

function pointList(points) {
  return points
    .map((point) => `(${formatNumber(point.x)} ${formatNumber(point.y)})`)
    .join(' ');
}

/**
 * Export a vectorization result as Links Notation (https://github.com/link-foundation/links-notation).
 *
 * Every node and edge of the stroke graph becomes a named link, and every pen
 * stroke becomes a link that references the edges it walks, in order, with
 * the direction of travel and a `retrace` marker for U-turn segments:
 *
 * ```
 * (raster: size 28 28)
 * (pen: width 2.5)
 * (n1: node 9.5 4.5)
 * (e3: edge n1 n2)
 * (e3points: points (9.5 4.5) (12 9) (14.5 20.5))
 * (stroke1: stroke (e3 n1 n2) (e3 n2 n1 retrace))
 * ```
 *
 * @param {{ width: number, height: number, strokeWidth: number,
 * graph: { nodes: object[], edges: object[] }, strokes: object[] }} result -
 * Output from vectorizeRasterLine.
 * @returns {string} Links Notation document.
 */
export function toLinksNotation(result) {
  const lines = [
    `(raster: size ${result.width} ${result.height})`,
    `(pen: width ${formatNumber(result.strokeWidth)})`,
  ];

  result.graph.nodes.forEach((node) => {
    lines.push(
      `(${nodeName(node.id)}: node ${formatNumber(node.x)} ${formatNumber(node.y)})`
    );
  });

  result.graph.edges.forEach((edge) => {
    const name = edgeName(edge.id);
    lines.push(
      `(${name}: edge ${nodeName(edge.source)} ${nodeName(edge.target)})`,
      `(${name}points: points ${pointList(edge.points)})`
    );
  });

  result.strokes.forEach((stroke, index) => {
    const steps =
      stroke.steps.length === 0
        ? [`(${nodeName(stroke.start)})`]
        : stroke.steps.map(
            (step) =>
              `(${edgeName(step.edge)} ${nodeName(step.from)} ${nodeName(
                step.to
              )}${step.retrace ? ' retrace' : ''})`
          );
    lines.push(`(stroke${index + 1}: stroke ${steps.join(' ')})`);
  });

  return `${lines.join('\n')}\n`;
}
