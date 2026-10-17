// Writes examples/recordings/seven-barred.{lino,json}: a barred seven drawn
// as two pen strokes (the 7 and its bar), sampled like a 60 Hz pointer.
import { writeFileSync } from 'node:fs';

import {
  beginPenStroke,
  createPenRecording,
  extendPenStroke,
  penRecordingToLinksNotation,
  rasterizePenRecording,
  vectorizeRasterLine,
} from '../src/index.js';

const recording = createPenRecording({ width: 280, height: 280 });
recording.options = { threshold: 32, alphaThreshold: 24 };
const strokes = [
  // Top bar then the long diagonal of the seven, in one stroke.
  [
    [70, 62],
    [205, 58],
    [150, 160],
    [112, 236],
  ],
  // The bar across the diagonal, a second stroke after a pen lift.
  [
    [118, 148],
    [196, 146],
  ],
];
let t = 0;

strokes.forEach((corners, strokeIndex) => {
  corners.slice(1).forEach((to, segment) => {
    const from = corners[segment];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.round(length / 6));

    for (let step = segment === 0 ? 0 : 1; step <= steps; step += 1) {
      const along = step / steps;
      const point = {
        x: from[0] + (to[0] - from[0]) * along + Math.sin(t / 37) * 0.8,
        y: from[1] + (to[1] - from[1]) * along + Math.cos(t / 53) * 0.8,
        t,
        pressure: 0.35 + 0.15 * Math.sin(t / 120),
      };

      if (segment === 0 && step === 0) {
        beginPenStroke(recording, point, 'pen');
      } else {
        extendPenStroke(recording, point);
      }
      t += 16.7;
    }
  });
  t += 250 + strokeIndex * 0;
});

writeFileSync(
  'examples/recordings/seven-barred.lino',
  penRecordingToLinksNotation(recording)
);
writeFileSync(
  'examples/recordings/seven-barred.json',
  `${JSON.stringify(recording, null, 2)}\n`
);

const result = vectorizeRasterLine(
  rasterizePenRecording(recording),
  recording.options
);
console.log(
  result.strokes.length,
  'strokes',
  result.strokes.map((s) => s.points.length),
  result.coverage
);
