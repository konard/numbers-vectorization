// Why does a slanted stroke crossed by a bar keep a kink at the crossing?
import { readFileSync } from 'node:fs';

import {
  parsePenRecording,
  rasterizePenRecording,
  vectorizeRasterLine,
} from '../src/index.js';

const recording = parsePenRecording(
  readFileSync(
    process.argv[2] ?? 'examples/recordings/seven-barred.lino',
    'utf8'
  )
);
const raster = rasterizePenRecording(recording);

for (const simplifyTolerance of ['auto', 0.5, 1.7, 2.4, 3.4, 4.8, 6.8, 9.6]) {
  const result = vectorizeRasterLine(raster, {
    ...recording.options,
    simplifyTolerance,
  });
  console.log(
    simplifyTolerance,
    result.path,
    JSON.stringify(result.simplification.shapes)
  );
}
const result = vectorizeRasterLine(raster, recording.options);
console.log(
  JSON.stringify(
    result.network.points.map(({ id, x, y, degree }) => ({ id, x, y, degree }))
  )
);
console.log(JSON.stringify(result.strokes.map((s) => s.steps)));
