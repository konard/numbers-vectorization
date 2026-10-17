// Before/after numbers for the issue 7 case study: runs one checkout's
// vectorizer (default: this one) on the issue 7 shapes, the 50 MNIST samples
// of the app and the recorded barred 7, and prints JSON.
// Usage: node experiments/issue-7-before-after.mjs [path/to/src/index.js]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  fourRaster,
  MULTI_STROKE_SHAPES,
  multiStrokeRaster,
} from '../tests/helpers/issue-7-shapes.js';
import {
  MNIST_SAMPLE_HEIGHT,
  MNIST_SAMPLE_LABELS,
  MNIST_SAMPLE_PIXELS_BASE64,
  MNIST_SAMPLE_WIDTH,
} from '../examples/universal-app/src/mnistSamples.js';
import {
  parsePenRecording,
  rasterizePenRecording,
} from '../src/pen-recording.js';

const entry = resolve(process.argv[2] ?? 'src/index.js');
const { vectorizeRasterLine } = await import(pathToFileURL(entry).href);

function measure(raster, options) {
  const result = vectorizeRasterLine(raster, options);
  const network = result.network ?? {
    points: result.graph.nodes,
    links: result.graph.edges,
  };
  const retrace = result.strokes.reduce(
    (sum, stroke) => sum + (stroke.retraceLength ?? 0),
    0
  );

  return {
    points: network.points.length,
    links: network.links.length,
    strokes: result.strokes.length,
    svgPoints: result.points.length,
    retrace: Math.round(retrace * 10) / 10,
    ink: Math.round(result.coverage.mask * 1000) / 1000,
  };
}

const size = MNIST_SAMPLE_WIDTH * MNIST_SAMPLE_HEIGHT;
const bytes = Buffer.from(MNIST_SAMPLE_PIXELS_BASE64, 'base64');
const mnist = MNIST_SAMPLE_LABELS.map((label, index) =>
  measure({
    width: MNIST_SAMPLE_WIDTH,
    height: MNIST_SAMPLE_HEIGHT,
    pixels: bytes.subarray(index * size, (index + 1) * size),
  })
);
const total = (key) => mnist.reduce((sum, sample) => sum + sample[key], 0);
const recording = parsePenRecording(
  readFileSync('examples/recordings/seven-barred.lino', 'utf8')
);

console.log(
  JSON.stringify(
    {
      vectorizer: entry,
      fourLoop: Object.fromEntries(
        [30, 14, 6, 3, 0].map((gap) => [`gap ${gap}`, measure(fourRaster(gap))])
      ),
      multiStroke: Object.fromEntries(
        Object.keys(MULTI_STROKE_SHAPES).map((name) => [
          name,
          measure(multiStrokeRaster(name)),
        ])
      ),
      sevenBarredRecording: measure(
        rasterizePenRecording(recording),
        recording.options
      ),
      mnist50: {
        strokes: total('strokes'),
        networkLinks: total('links'),
        svgPoints: total('svgPoints'),
        retrace: Math.round(total('retrace') * 10) / 10,
        meanInk: Math.round((total('ink') / mnist.length) * 1000) / 1000,
        minInk: Math.min(...mnist.map((sample) => sample.ink)),
      },
    },
    null,
    2
  )
);
