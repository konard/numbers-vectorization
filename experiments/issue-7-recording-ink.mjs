// Ink pixel counts of rasterized pen recordings (issue 7).
import {
  beginPenStroke,
  createPenRecording,
  extendPenStroke,
  rasterizePenRecording,
} from '../src/index.js';

const recording = createPenRecording({ width: 140, height: 140 });
beginPenStroke(recording, { x: 30, y: 70, t: 0, pressure: 0.2 });
for (let step = 1; step <= 20; step += 1) {
  extendPenStroke(recording, {
    x: 30 + step * 4,
    y: 70,
    t: step * 8,
    pressure: 0.2,
  });
}
const raster = rasterizePenRecording(recording);
let any = 0;
let sum = 0;
for (let index = 3; index < raster.pixels.length; index += 4) {
  any += raster.pixels[index] > 0 ? 1 : 0;
  sum += raster.pixels[index] / 255;
}
console.log({
  any,
  coverageSum: sum.toFixed(1),
  expected: 80 * 12.6 + Math.PI * 6.3 ** 2,
});
