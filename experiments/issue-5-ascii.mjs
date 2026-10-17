// Prints an ASCII view of one bundled MNIST sample: ink pixels reached by the
// rendered pen ('#'), ink pixels the pen misses ('o'), skeleton pixels ('+'),
// graph nodes ('N') and the stroke plan.
//
// Usage: node experiments/issue-5-ascii.mjs <sampleIndex> [more indices...]
import { pointSegmentDistance } from '../src/geometry.js';
import { vectorizeRasterLine } from '../src/index.js';
import { loadBundledMnistSamples } from './lib/mnist-samples.mjs';

const samples = loadBundledMnistSamples();

for (const argument of process.argv.slice(2)) {
  const { raster, label } = samples[Number(argument)];
  const result = vectorizeRasterLine(raster);
  const { width, height } = raster;
  const pen = result.coverage.penWidth / 2 + Math.SQRT1_2;
  const segments = result.strokes.flatMap((stroke) =>
    stroke.points.length === 1
      ? [[stroke.points[0], stroke.points[0]]]
      : stroke.points.slice(1).map((point, i) => [stroke.points[i], point])
  );
  const nodes = new Set(
    result.network.points.map(
      (node) => Math.floor(node.y) * width + Math.floor(node.x)
    )
  );
  const lines = [];

  for (let y = 0; y < height; y += 1) {
    let line = '';

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const point = { x: x + 0.5, y: y + 0.5 };
      const distance = Math.min(
        ...segments.map(([a, b]) => pointSegmentDistance(point, a, b))
      );

      if (nodes.has(index)) {
        line += 'N';
      } else if (result.skeleton[index]) {
        line += '+';
      } else if (result.mask[index]) {
        line += distance <= pen ? '#' : 'o';
      } else {
        line += '.';
      }
    }

    lines.push(line);
  }

  console.log(`sample ${argument} label ${label}`);
  console.log(lines.join('\n'));
  console.log(
    'coverage',
    JSON.stringify({ ...result.coverage, uncoveredSkeletonPixels: undefined })
  );
  console.log('strokeWidth', result.strokeWidth, 'path', result.path);
  console.log(result.lino);
}
