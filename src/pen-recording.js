import { formatNumber } from './geometry.js';

/**
 * Pen movement recordings (issue 7): every pointer stroke drawn on a canvas
 * is kept as timed samples `{ x, y, t, pressure }` so a drawing can be
 * replayed, attached to an error report and rasterized again outside the
 * browser exactly as it was drawn.
 *
 * The brush matches the web app pencil: a round pen whose width is
 * `brush.width + brush.pressureWidth * pressure` pixels.
 */
export const PEN_RECORDING_TYPE = 'pen-recording';
export const DEFAULT_BRUSH = Object.freeze({ width: 9, pressureWidth: 18 });

const INK = [16, 24, 32];

function roundTo(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sample(point) {
  return {
    x: roundTo(point.x, 2),
    y: roundTo(point.y, 2),
    t: roundTo(point.t ?? 0, 1),
    pressure: roundTo(point.pressure ?? 0.5, 3),
  };
}

/**
 * An empty recording for a canvas.
 * @param {{ width: number, height: number, brush?: { width: number,
 * pressureWidth: number } }} canvas - Canvas size and brush.
 * @returns {object} Recording.
 */
export function createPenRecording({ width, height, brush = DEFAULT_BRUSH }) {
  return {
    type: PEN_RECORDING_TYPE,
    version: 1,
    width,
    height,
    brush: { ...brush },
    strokes: [],
  };
}

/**
 * Start a new stroke where the pen touches down. Mutates `recording` so
 * pointer events stay cheap.
 * @param {object} recording - Recording to extend.
 * @param {{ x: number, y: number, t: number, pressure?: number }} point -
 * Position (canvas pixels), time (ms since the recording started), pressure.
 * @param {string} [pointer] - Pointer type: mouse, pen or touch.
 */
export function beginPenStroke(recording, point, pointer = 'mouse') {
  recording.strokes.push({ pointer, samples: [sample(point)] });
}

/** Add a pen sample to the current stroke (see `beginPenStroke`). */
export function extendPenStroke(recording, point) {
  const stroke = recording.strokes.at(-1);

  if (!stroke) {
    throw new RangeError('Begin a pen stroke before extending it.');
  }

  stroke.samples.push(sample(point));
}

/** Milliseconds from the first to the last sample. */
export function penRecordingDuration(recording) {
  return recording.strokes.reduce(
    (latest, stroke) => Math.max(latest, stroke.samples.at(-1)?.t ?? 0),
    0
  );
}

/**
 * The segments the pen draws, in time order: a touch-down is a zero-length
 * segment (a dot) and every later sample adds a segment from the previous
 * one. Each segment is drawn with the pen width of its end sample.
 * @param {object} recording - Pen recording.
 * @returns {{ from: object, to: object, t: number, width: number }[]}
 * Segments.
 */
export function penRecordingSegments(recording) {
  const { width, pressureWidth } = recording.brush ?? DEFAULT_BRUSH;

  return recording.strokes.flatMap((stroke) =>
    stroke.samples.map((to, index) => ({
      from: stroke.samples[Math.max(0, index - 1)],
      to,
      t: to.t,
      width: width + pressureWidth * to.pressure,
    }))
  );
}

function segmentDistance(px, py, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - from.x) * dx + (py - from.y) * dy) / lengthSquared)
        );

  return Math.hypot(px - (from.x + along * dx), py - (from.y + along * dy));
}

function paintSegment(alpha, raster, segment) {
  const radius = segment.width / 2;
  const left = Math.max(
    0,
    Math.floor(Math.min(segment.from.x, segment.to.x) - radius - 1)
  );
  const right = Math.min(
    raster.width - 1,
    Math.ceil(Math.max(segment.from.x, segment.to.x) + radius + 1)
  );
  const top = Math.max(
    0,
    Math.floor(Math.min(segment.from.y, segment.to.y) - radius - 1)
  );
  const bottom = Math.min(
    raster.height - 1,
    Math.ceil(Math.max(segment.from.y, segment.to.y) + radius + 1)
  );

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      // Pixel centres, with one pixel of linear anti-aliasing like a canvas.
      const distance = segmentDistance(
        x + 0.5,
        y + 0.5,
        segment.from,
        segment.to
      );
      const cover = Math.max(0, Math.min(1, radius + 0.5 - distance));
      const index = y * raster.width + x;
      alpha[index] = Math.max(alpha[index], cover);
    }
  }
}

/**
 * Draw a recording into an RGBA raster: dark ink on a transparent canvas,
 * like the web app pencil.
 * @param {object} recording - Pen recording.
 * @param {{ until?: number }} [options] - Only draw samples up to this time
 * (ms), for replays.
 * @returns {{ width: number, height: number, pixels: Uint8ClampedArray }}
 * RGBA raster.
 */
export function rasterizePenRecording(recording, options = {}) {
  const { width, height } = recording;
  const until = options.until ?? Infinity;
  const alpha = new Float64Array(width * height);
  const raster = { width, height };

  penRecordingSegments(recording)
    .filter((segment) => segment.t <= until)
    .forEach((segment) => paintSegment(alpha, raster, segment));

  const pixels = new Uint8ClampedArray(width * height * 4);
  alpha.forEach((cover, index) => {
    if (cover > 0) {
      pixels.set([...INK, Math.round(cover * 255)], index * 4);
    }
  });

  return { width, height, pixels };
}

function optionValue(value) {
  return typeof value === 'number' ? formatNumber(value) : String(value);
}

/**
 * Write a recording as indented Links Notation:
 *
 * ```
 * recording:
 *   canvas 280 280
 *   brush 9 18
 *   options:
 *     threshold 32
 *   strokes:
 *     stroke1:
 *       pointer pen
 *       samples:
 *         12.5 30 0 0.45
 *         14 31.25 16.7 0.5
 * ```
 *
 * Each sample is `x y t pressure`.
 * @param {object} recording - Pen recording.
 * @returns {string} Links Notation document.
 */
export function penRecordingToLinksNotation(recording) {
  const { width, pressureWidth } = recording.brush ?? DEFAULT_BRUSH;
  const options = Object.entries(recording.options ?? {});
  const lines = [
    'recording:',
    `  canvas ${recording.width} ${recording.height}`,
    `  brush ${formatNumber(width)} ${formatNumber(pressureWidth)}`,
    ...(options.length === 0
      ? []
      : [
          '  options:',
          ...options.map(([key, value]) => `    ${key} ${optionValue(value)}`),
        ]),
    '  strokes:',
    ...recording.strokes.flatMap((stroke, index) => [
      `    stroke${index + 1}:`,
      `      pointer ${stroke.pointer}`,
      '      samples:',
      ...stroke.samples.map(
        (point) =>
          `        ${[point.x, point.y, point.t, point.pressure].map(formatNumber).join(' ')}`
      ),
    ]),
  ];

  return `${lines.join('\n')}\n`;
}

/** Read indentation into `{ words, children }` nodes. */
function indentedTree(text) {
  const root = { indent: -1, words: [], children: [] };
  const stack = [root];

  text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .forEach((line) => {
      const indent = line.length - line.trimStart().length;
      const node = { indent, words: line.trim().split(/\s+/), children: [] };

      while (stack.at(-1).indent >= indent) {
        stack.pop();
      }

      stack.at(-1).children.push(node);
      stack.push(node);
    });

  return root.children;
}

function child(node, name) {
  return node.children.find(
    (entry) => entry.words[0].replace(/:$/, '') === name
  );
}

function parseValue(word) {
  if (word === 'true' || word === 'false') {
    return word === 'true';
  }

  const number = Number(word);
  return Number.isFinite(number) ? number : word;
}

function fromLinksNotation(text) {
  const [root] = indentedTree(text);

  if (!root || root.words[0] !== 'recording:') {
    throw new SyntaxError('A pen recording starts with "recording:".');
  }

  const [, width, height] = child(root, 'canvas')?.words ?? [];
  const [, brushWidth, pressureWidth] = child(root, 'brush')?.words ?? [];
  const options = child(root, 'options');
  const recording = createPenRecording({
    width: Number(width),
    height: Number(height),
    brush: brushWidth
      ? { width: Number(brushWidth), pressureWidth: Number(pressureWidth) }
      : DEFAULT_BRUSH,
  });

  if (options) {
    recording.options = Object.fromEntries(
      options.children.map(({ words: [key, value] }) => [
        key,
        parseValue(value),
      ])
    );
  }

  recording.strokes = (child(root, 'strokes')?.children ?? []).map(
    (stroke) => ({
      pointer: child(stroke, 'pointer')?.words[1] ?? 'mouse',
      samples: (child(stroke, 'samples')?.children ?? []).map(({ words }) => {
        const [x, y, t, pressure] = words.map(Number);
        return { x, y, t, pressure };
      }),
    })
  );

  return recording;
}

function assertRecording(recording) {
  const size = (value) => Number.isInteger(value) && value > 0 && value <= 4096;

  if (!size(recording.width) || !size(recording.height)) {
    throw new RangeError('A pen recording needs a canvas of 1..4096 pixels.');
  }

  if (!Array.isArray(recording.strokes)) {
    throw new TypeError('A pen recording needs a list of strokes.');
  }

  recording.strokes.forEach((stroke) => {
    if (!Array.isArray(stroke.samples) || stroke.samples.length === 0) {
      throw new TypeError('Every pen stroke needs at least one sample.');
    }

    stroke.samples.forEach((point) => {
      if (![point.x, point.y, point.t, point.pressure].every(Number.isFinite)) {
        throw new TypeError('Pen samples need numeric x, y, t and pressure.');
      }
    });
  });

  return recording;
}

/** True when the text looks like a pen recording (JSON or Links Notation). */
export function isPenRecordingText(text) {
  const trimmed = text.trimStart();

  return (
    trimmed.startsWith('recording:') ||
    (trimmed.startsWith('{') && trimmed.includes(`"${PEN_RECORDING_TYPE}"`))
  );
}

/**
 * Read a recording saved as JSON or as Links Notation.
 * @param {string} text - Recording document.
 * @returns {object} Validated recording.
 */
export function parsePenRecording(text) {
  const trimmed = text.trimStart();

  if (!trimmed.startsWith('{')) {
    return assertRecording(fromLinksNotation(trimmed));
  }

  const parsed = JSON.parse(trimmed);

  if (parsed.type !== PEN_RECORDING_TYPE) {
    throw new TypeError(
      `Expected a JSON object with type "${PEN_RECORDING_TYPE}".`
    );
  }

  return assertRecording({
    ...createPenRecording({
      width: parsed.width,
      height: parsed.height,
      brush: parsed.brush ?? DEFAULT_BRUSH,
    }),
    ...(parsed.options ? { options: parsed.options } : {}),
    strokes: parsed.strokes,
  });
}
