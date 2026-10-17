// Print the stroke network and the planned strokes of the multi-stroke shapes
// of issue #7 (+, x, T, 7 with a bar, A, open 4).
// Usage: node experiments/issue-7-pen-lifts.mjs [name...]
import { vectorizeRasterLine } from '../src/index.js';
import {
  MULTI_STROKE_SHAPES,
  multiStrokeRaster,
} from '../tests/helpers/issue-7-shapes.js';

const names = process.argv.slice(2);

for (const name of names.length > 0
  ? names
  : Object.keys(MULTI_STROKE_SHAPES)) {
  const result = vectorizeRasterLine(multiStrokeRaster(name));
  const degrees = result.graph.nodes.map((node) => node.degree).join(',');
  const strokes = result.strokes
    .map((stroke) => {
      const [first, last] = [stroke.points[0], stroke.points.at(-1)];
      return `(${first.x},${first.y})->(${last.x},${last.y}) retrace ${stroke.retraceLength}`;
    })
    .join('; ');

  console.log(
    `${name}: ${result.graph.nodes.length} nodes [${degrees}], ` +
      `${result.graph.edges.length} links, mask ${result.coverage.mask}: ${strokes}`
  );
}
