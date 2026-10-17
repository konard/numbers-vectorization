// Reproduces issue #5: measures how much of every MNIST digit skeleton the
// vectorizer actually draws, before (longest endpoint path only) and after
// (stroke graph + route inspection traversal).
//
// Usage: node experiments/issue-5-coverage.mjs [--verbose]
import { measureCoverage, vectorizeRasterLine } from '../src/index.js';
import { vectorizeRasterLine as vectorizeBefore } from './baseline/index-before-issue-5.js';
import { loadBundledMnistSamples } from './lib/mnist-samples.mjs';

const verbose = process.argv.includes('--verbose');
const samples = loadBundledMnistSamples();
const rows = [];

for (const { index, label, raster } of samples) {
  const after = vectorizeRasterLine(raster);
  const before = vectorizeBefore(raster);
  const beforeCoverage = measureCoverage(
    {
      width: raster.width,
      height: raster.height,
      mask: before.mask,
      skeleton: before.skeleton,
      strokeWidth: after.coverage.penWidth,
    },
    [before.points]
  );

  rows.push({
    index,
    label,
    beforeSkeleton: beforeCoverage.skeleton,
    beforeMask: beforeCoverage.mask,
    afterSkeleton: after.coverage.skeleton,
    afterMask: after.coverage.mask,
    precision: after.coverage.precision,
    strokes: after.strokes.length,
    retrace: after.strokes.reduce((sum, s) => sum + s.retraceLength, 0),
    edges: `${after.coverage.links.traversed}/${after.coverage.links.total}`,
    nodes: after.network.points.length,
  });

  if (verbose) {
    console.log(index, label, after.path);
  }
}

const percent = (value) => `${(value * 100).toFixed(1)}%`;
console.log(
  'idx label | before skel  mask | after skel  mask  prec | strokes edges retrace'
);

for (const row of rows) {
  console.log(
    `${String(row.index).padStart(3)} ${row.label}     | ${percent(row.beforeSkeleton).padStart(6)} ${percent(row.beforeMask).padStart(6)} | ${percent(row.afterSkeleton).padStart(6)} ${percent(row.afterMask).padStart(6)} ${percent(row.precision).padStart(6)} | ${row.strokes} ${row.edges.padStart(5)} ${row.retrace.toFixed(1)}`
  );
}

const mean = (key) =>
  rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
const full = (key) => rows.filter((row) => row[key] === 1).length;
console.log('---');
console.log(
  `before: mean skeleton ${percent(mean('beforeSkeleton'))}, mean mask ${percent(mean('beforeMask'))}, fully covered ${full('beforeSkeleton')}/${rows.length}`
);
console.log(
  `after:  mean skeleton ${percent(mean('afterSkeleton'))}, mean mask ${percent(mean('afterMask'))}, fully covered ${full('afterSkeleton')}/${rows.length}, min mask ${percent(Math.min(...rows.map((r) => r.afterMask)))}, mean precision ${percent(mean('precision'))}`
);
