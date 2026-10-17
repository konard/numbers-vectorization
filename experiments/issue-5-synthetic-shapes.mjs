// Prints how the synthetic shapes used in tests/stroke-traversal.test.js
// vectorize: strokes, retraces, edges and coverage.
import { vectorizeRasterLine } from '../src/index.js';
import { SHAPES, rasterFromRows } from '../tests/helpers/shapes.js';

for (const [name, rows] of Object.entries(SHAPES)) {
  const result = vectorizeRasterLine(rasterFromRows(rows));
  console.log(
    name.padEnd(12),
    JSON.stringify({
      strokes: result.strokes.length,
      steps: result.strokes.map((s) => s.steps.length),
      retrace: result.strokes.map((s) => s.retraceLength),
      nodes: result.network.points.map((n) => n.degree).join(','),
      edges: `${result.coverage.links.traversed}/${result.coverage.links.total}`,
      skeleton: result.coverage.skeleton,
      mask: Number(result.coverage.mask.toFixed(3)),
    })
  );
  console.log('   ', result.path);
}
