/**
 * Pen recordings in the app (issue 7): the pen movement of the Draw mode is
 * kept with the library's recording functions, so a drawing can be replayed,
 * exported with the settings it was vectorized with and attached to an
 * error report. Pure functions, tested without a browser.
 */
import { penRecordingDuration } from '../../../src/index.js';

/** Strokes, samples and duration (ms) of a recording. */
export function recordingSummary(recording) {
  return {
    strokes: recording.strokes.length,
    samples: recording.strokes.reduce(
      (sum, stroke) => sum + stroke.samples.length,
      0
    ),
    duration: penRecordingDuration(recording),
  };
}

/** The recording with the vectorization options it is exported with. */
export function recordingForExport(recording, options) {
  return { ...recording, options: { ...options } };
}

/**
 * Scale a recording made on another canvas onto a square `size` canvas,
 * keeping its aspect ratio (and the pen width in proportion).
 * @param {object} recording - Pen recording.
 * @param {number} size - Side of the drawing canvas in pixels.
 * @returns {object} The same recording when it already fits, else a copy.
 */
export function fitRecording(recording, size) {
  if (recording.width === size && recording.height === size) {
    return recording;
  }

  const scale = size / Math.max(recording.width, recording.height);

  return {
    ...recording,
    width: size,
    height: size,
    brush: {
      width: recording.brush.width * scale,
      pressureWidth: recording.brush.pressureWidth * scale,
    },
    strokes: recording.strokes.map((stroke) => ({
      ...stroke,
      samples: stroke.samples.map((point) => ({
        ...point,
        x: point.x * scale,
        y: point.y * scale,
      })),
    })),
  };
}
