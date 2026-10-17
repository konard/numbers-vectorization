// Does the automatic (Otsu) threshold explain the 50 app MNIST samples as
// well as the fixed threshold 32? Prints per-setting aggregate metrics.
import { vectorizeRasterLine } from '../src/index.js';
import {
  MNIST_SAMPLE_COUNT,
  MNIST_SAMPLE_HEIGHT,
  MNIST_SAMPLE_PIXELS_BASE64,
  MNIST_SAMPLE_WIDTH,
} from '../examples/universal-app/src/mnistSamples.js';

const bytes = Buffer.from(MNIST_SAMPLE_PIXELS_BASE64, 'base64');
const size = MNIST_SAMPLE_WIDTH * MNIST_SAMPLE_HEIGHT;
const samples = Array.from({ length: MNIST_SAMPLE_COUNT }, (_, index) => ({
  width: MNIST_SAMPLE_WIDTH,
  height: MNIST_SAMPLE_HEIGHT,
  pixels: bytes.subarray(index * size, (index + 1) * size),
}));

for (const [name, options] of [
  ['threshold 32', { threshold: 32 }],
  ['auto (Otsu)', { foreground: 'auto' }],
]) {
  const totals = {
    mask: 0,
    skeleton: 0,
    strokes: 0,
    points: 0,
    thresholds: [],
  };
  samples.forEach((raster) => {
    const r = vectorizeRasterLine(raster, options);
    totals.mask += r.coverage.mask / samples.length;
    totals.skeleton += r.coverage.skeleton / samples.length;
    totals.strokes += r.strokes.length;
    totals.points += r.points.length;
    totals.thresholds.push(r.thresholding.threshold);
  });
  console.log(
    name,
    JSON.stringify({
      ...totals,
      thresholds: [
        Math.min(...totals.thresholds),
        Math.max(...totals.thresholds),
      ],
    })
  );
}
