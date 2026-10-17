// A straight pen line whose middle is pressed harder (wider ink). The
// simplest explanation is one line, without perpendicular "fishbone" stubs.
// Usage: node experiments/issue-7-pressure-line.mjs [wideRadius...]
import { vectorizeRasterLine } from '../src/index.js';
import { pressureLine } from '../tests/helpers/issue-7-shapes.js';

const radii = process.argv.slice(2).map(Number);

for (const radius of radii.length > 0 ? radii : [6, 8, 10, 12, 14, 18]) {
  const result = vectorizeRasterLine(pressureLine(radius));
  const { points: nodes, links: edges } = result.network;
  console.log(
    `wide ${radius}: ${nodes.length} n / ${edges.length} e,`,
    `${edges.filter((edge) => edge.completed).length} completed,`,
    `retrace ${result.strokes.map((s) => s.retraceLength).join('+')},`,
    `mask ${result.coverage.mask.toFixed(3)}`
  );
}
