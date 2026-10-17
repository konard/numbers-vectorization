// Reproduces the hand-drawn "4" from issue #7: down, curve right, up into a
// loop, then down through the bar. `gap` is the distance between the up and
// the down line of the loop: an open loop (image 1), a narrow loop (image 2)
// and a loop filled into one blob (image 3).
// Usage: node experiments/issue-7-four-loop.mjs [gap...] [--trace] [--png=dir]
import { mkdirSync, writeFileSync } from 'node:fs';

import { vectorizeRasterLine } from '../src/index.js';
import { fourRaster } from '../tests/helpers/issue-7-shapes.js';
import { renderNetwork } from './lib/render-network.mjs';

const args = process.argv.slice(2);
const trace = args.includes('--trace');
const png = args.find((arg) => arg.startsWith('--png='))?.slice(6);
const gaps = args.filter((arg) => !arg.startsWith('--')).map(Number);

for (const gap of gaps.length > 0 ? gaps : [30, 20, 14, 10, 6, 3, 0]) {
  const result = vectorizeRasterLine(fourRaster(gap), {
    trace: trace
      ? (stage, store) =>
          console.log(`  ${stage}: ${store.points().length} nodes`)
      : undefined,
  });
  const retrace = result.strokes.reduce((sum, s) => sum + s.retraceLength, 0);
  console.log(
    `gap ${gap}: ${result.graph.nodes.length} n / ${result.graph.edges.length} e,`,
    `${result.strokes.length} strokes, ${result.points.length} pts,`,
    `retrace ${retrace.toFixed(1)}, mask ${result.coverage.mask.toFixed(3)}`
  );

  if (png) {
    mkdirSync(png, { recursive: true });
    writeFileSync(
      `${png}/four-gap-${gap}.png`,
      renderNetwork(result, { scale: 2 })
    );
  }
}
