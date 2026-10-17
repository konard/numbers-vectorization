// Render the planned strokes of bundled MNIST samples (one colour per stroke)
// and print a one-line summary per sample:
// index label nodes/links strokes points mask precision completed.
// Usage: node experiments/issue-7-mnist-strokes.mjs [--png=dir] [index...]
// Set PEN_LIFTS=0 to plan one stroke per connected component.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { vectorizeRasterLine } from '../src/index.js';
import { loadBundledMnistSamples } from './lib/mnist-samples.mjs';
import { renderNetwork } from './lib/render-network.mjs';

const args = process.argv.slice(2);
const png = args.find((arg) => arg.startsWith('--png='))?.slice(6);
const wanted = args.filter((arg) => !arg.startsWith('--')).map(Number);
const options = { penLifts: process.env.PEN_LIFTS !== '0' };

if (png) {
  mkdirSync(png, { recursive: true });
}

for (const { index, label, raster } of loadBundledMnistSamples()) {
  if (wanted.length > 0 && !wanted.includes(index)) {
    continue;
  }

  const result = vectorizeRasterLine(raster, options);
  const points = result.strokes.reduce((sum, s) => sum + s.points.length, 0);
  const { nodes, edges } = result.graph;

  console.log(
    index,
    label,
    `${nodes.length}n/${edges.length}e`,
    result.strokes.length,
    points,
    result.coverage.mask.toFixed(3),
    result.coverage.precision.toFixed(3),
    edges.filter((edge) => edge.completed).length
  );

  if (png) {
    writeFileSync(
      join(png, `mnist-${index}-strokes.png`),
      renderNetwork(result, { scale: 12, strokes: true })
    );
    writeFileSync(
      join(png, `mnist-${index}-network.png`),
      renderNetwork(result, { scale: 12 })
    );
  }
}
