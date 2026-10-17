// Runs the pen-recording example of the README (issue 7).
import {
  parsePenRecording,
  rasterizePenRecording,
  vectorizeRasterLine,
} from '../src/index.js';

const recording = parsePenRecording(`recording:
  canvas 280 280
  brush 9 18
  options:
    threshold 32
  strokes:
    stroke1:
      pointer pen
      samples:
        70 62.8 0 0.35
        210 60 400 0.5
        120 230 900 0.4`);

const result = vectorizeRasterLine(
  rasterizePenRecording(recording),
  recording.options
);
console.log(result.strokes.length, 'strokes', result.points, result.settings);
