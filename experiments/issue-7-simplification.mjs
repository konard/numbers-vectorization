// Compare the fixed simplification tolerance with the automatic per-shape
// tuning (and point budgets) on the bundled MNIST samples and the issue 7
// synthetic shapes. Prints per sample: points and match (IoU of the drawn pen
// and the ink) for each setting, plus the tolerance auto picked.
// Usage: node experiments/issue-7-simplification.mjs [--point-cost=1]
import { vectorizeRasterLine } from '../src/index.js';
import {
  MULTI_STROKE_SHAPES,
  fourRaster,
  multiStrokeRaster,
} from '../tests/helpers/issue-7-shapes.js';
import { loadBundledMnistSamples } from './lib/mnist-samples.mjs';

const pointCost = Number(
  process.argv.find((arg) => arg.startsWith('--point-cost='))?.slice(13) ?? 1
);
const SETTINGS = {
  fixed: { simplifyTolerance: 0.85 },
  auto: { pointCost },
  max4: { pointCost, maxPoints: 4 },
  max2: { pointCost, maxPoints: 2 },
  max1: { pointCost, maxPoints: 1 },
};
const samples = [
  ...loadBundledMnistSamples().map(({ index, label, raster }) => ({
    name: `mnist-${index}(${label})`,
    raster,
  })),
  ...Object.keys(MULTI_STROKE_SHAPES).map((name) => ({
    name,
    raster: multiStrokeRaster(name),
  })),
  { name: 'four-30', raster: fourRaster(30) },
];
const totals = Object.fromEntries(
  Object.keys(SETTINGS).map((key) => [key, { points: 0, match: 0 }])
);

for (const { name, raster } of samples) {
  const cells = Object.entries(SETTINGS).map(([key, options]) => {
    const result = vectorizeRasterLine(raster, options);
    const shapes = result.simplification.shapes;
    const points = shapes.reduce((sum, shape) => sum + shape.points, 0);
    const match =
      shapes.reduce((sum, shape) => sum + shape.match, 0) / shapes.length;
    totals[key].points += points;
    totals[key].match += match;
    const tolerance =
      key === 'auto' ? `@${shapes.map((s) => s.tolerance).join('/')}` : '';
    return `${key} ${points}p ${match.toFixed(3)}${tolerance}`;
  });

  console.log(name.padEnd(16), cells.join(' | '));
}

console.log(
  'total'.padEnd(16),
  Object.entries(totals)
    .map(
      ([key, { points, match }]) =>
        `${key} ${points}p ${(match / samples.length).toFixed(3)}`
    )
    .join(' | ')
);
