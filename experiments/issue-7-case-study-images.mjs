// Before/after PNGs for docs/case-studies/issue-7/images: the stroke network
// of the hand-drawn "4" at several loop gaps and the pen strokes of the
// multi-stroke shapes, rendered with this checkout and with another one.
// Usage: node experiments/issue-7-case-study-images.mjs <before src/index.js> <dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { vectorizeRasterLine } from '../src/index.js';
import {
  fourRaster,
  multiStrokeRaster,
} from '../tests/helpers/issue-7-shapes.js';
import {
  parsePenRecording,
  rasterizePenRecording,
} from '../src/pen-recording.js';
import { renderNetwork } from './lib/render-network.mjs';

const [beforeEntry, dir = 'docs/case-studies/issue-7/images'] =
  process.argv.slice(2);
const before = (await import(pathToFileURL(resolve(beforeEntry)).href))
  .vectorizeRasterLine;
const recording = parsePenRecording(
  readFileSync('examples/recordings/seven-barred.lino', 'utf8')
);
const cases = [
  ...[30, 14, 6].map((gap) => [`four-gap-${gap}`, fourRaster(gap), {}]),
  ...['plus', 'seven', 'letterA'].map((name) => [
    name,
    multiStrokeRaster(name),
    {},
  ]),
  [
    'seven-barred-recording',
    rasterizePenRecording(recording),
    recording.options,
  ],
];

mkdirSync(dir, { recursive: true });
cases.forEach(([name, raster, options]) => {
  [
    ['before', before],
    ['after', vectorizeRasterLine],
  ].forEach(([label, vectorize]) => {
    const result = vectorize(raster, options);
    const scale = raster.width <= 28 ? 8 : 1;
    writeFileSync(
      `${dir}/${name}-${label}-network.png`,
      renderNetwork(result, { scale })
    );
    writeFileSync(
      `${dir}/${name}-${label}-strokes.png`,
      renderNetwork(result, { scale, strokes: true })
    );
  });
});
console.log(`${cases.length * 4} images in ${dir}`);
