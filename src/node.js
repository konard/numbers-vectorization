import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const INK_CHARACTERS = /[^.\s0_-]/;

function isPng(bytes) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readPngChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = PNG_SIGNATURE.length;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    chunks.push({
      type,
      data: bytes.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + 12;

    if (type === 'IEND') {
      break;
    }
  }

  return chunks;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);

  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }

  return toUp <= toUpLeft ? up : upLeft;
}

function unfilterScanlines(data, height, stride, bytesPerPixel) {
  const rows = new Uint8Array(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = data[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = data[source + x];
      const left = x >= bytesPerPixel ? rows[target + x - bytesPerPixel] : 0;
      const up = y > 0 ? rows[target - stride + x] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel
          ? rows[target - stride + x - bytesPerPixel]
          : 0;
      const predictors = [
        0,
        left,
        up,
        (left + up) >> 1,
        paeth(left, up, upLeft),
      ];

      if (predictors[filter] === undefined) {
        throw new Error(`Unsupported PNG filter type: ${filter}`);
      }

      rows[target + x] = (raw + predictors[filter]) & 0xff;
    }
  }

  return rows;
}

function readSample(rows, offset, bitDepth, index) {
  if (bitDepth === 8) {
    return rows[offset + index];
  }

  if (bitDepth === 16) {
    return rows[offset + index * 2];
  }

  const perByte = 8 / bitDepth;
  const byte = rows[offset + Math.floor(index / perByte)];
  const shift = 8 - bitDepth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

function pngColor(header, samples, palette, transparency) {
  const { colorType, bitDepth } = header;
  const scale =
    colorType === 3 || bitDepth >= 8 ? 1 : 255 / (2 ** bitDepth - 1);

  if (colorType === 3) {
    const [red = 0, green = 0, blue = 0] = palette.subarray(
      samples[0] * 3,
      samples[0] * 3 + 3
    );
    return [red, green, blue, transparency?.[samples[0]] ?? 255];
  }

  const gray = samples[0] * scale;

  if (colorType === 0) {
    return [gray, gray, gray, transparency?.gray === samples[0] ? 0 : 255];
  }

  if (colorType === 4) {
    return [gray, gray, gray, samples[1]];
  }

  return [samples[0], samples[1], samples[2], samples[3] ?? 255];
}

function readTransparency(chunk, colorType) {
  if (!chunk) {
    return null;
  }

  if (colorType === 0) {
    return { gray: (chunk.data[0] << 8) | chunk.data[1] };
  }

  return colorType === 3 ? chunk.data : null;
}

/**
 * Decode a non-interlaced PNG (any color type, bit depths 1-16) into RGBA.
 *
 * @param {Uint8Array} bytes - PNG file contents.
 * @returns {{ width: number, height: number, pixels: Uint8ClampedArray }}
 * RGBA raster.
 */
export function decodePng(bytes) {
  if (!isPng(bytes)) {
    throw new Error('Not a PNG file.');
  }

  const chunks = readPngChunks(bytes);
  const header = chunks.find((chunk) => chunk.type === 'IHDR').data;
  const view = new DataView(header.buffer, header.byteOffset, header.length);
  const info = {
    width: view.getUint32(0),
    height: view.getUint32(4),
    bitDepth: header[8],
    colorType: header[9],
  };

  if (header[12] !== 0) {
    throw new Error('Interlaced PNG files are not supported.');
  }

  const channels = PNG_CHANNELS[info.colorType];
  const bitsPerPixel = channels * info.bitDepth;
  const stride = Math.ceil((info.width * bitsPerPixel) / 8);
  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)
  );
  const rows = unfilterScanlines(
    inflateSync(compressed),
    info.height,
    stride,
    Math.max(1, bitsPerPixel / 8)
  );
  const palette =
    chunks.find((chunk) => chunk.type === 'PLTE')?.data ?? new Uint8Array();
  const transparency = readTransparency(
    chunks.find((chunk) => chunk.type === 'tRNS'),
    info.colorType
  );
  const pixels = new Uint8ClampedArray(info.width * info.height * 4);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const samples = Array.from({ length: channels }, (_, channel) =>
        readSample(rows, y * stride, info.bitDepth, x * channels + channel)
      );
      pixels.set(
        pngColor(info, samples, palette, transparency),
        (y * info.width + x) * 4
      );
    }
  }

  return { width: info.width, height: info.height, pixels };
}

function pnmTokens(bytes, count) {
  const tokens = [];
  let offset = 0;

  while (tokens.length < count && offset < bytes.length) {
    const char = String.fromCharCode(bytes[offset]);

    if (char === '#') {
      while (offset < bytes.length && bytes[offset] !== 0x0a) {
        offset += 1;
      }
    } else if (/\s/.test(char)) {
      offset += 1;
    } else {
      let token = '';

      while (
        offset < bytes.length &&
        !/\s/.test(String.fromCharCode(bytes[offset]))
      ) {
        token += String.fromCharCode(bytes[offset]);
        offset += 1;
      }

      tokens.push(token);
    }
  }

  return { tokens, offset: offset + 1 };
}

function pnmSamples(bytes, kind, size, offset) {
  const { width, height, channels } = size;
  const count = width * height * channels;

  if (kind <= 3) {
    const text = Buffer.from(bytes.subarray(offset)).toString('utf8');
    const values =
      kind === 1
        ? text.replace(/[^01]/g, '').split('')
        : text.trim().split(/\s+/);
    return values.slice(0, count).map(Number);
  }

  if (kind === 4) {
    const rowBytes = Math.ceil(width / 8);
    return Array.from({ length: count }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return (bytes[offset + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
    });
  }

  return Array.from(bytes.subarray(offset, offset + count));
}

/**
 * Decode Netpbm images (PBM/PGM/PPM, plain P1-P3 and raw P4-P6) into RGBA.
 * PBM bits use the Netpbm convention: 1 is black ink.
 */
export function decodePnm(bytes) {
  const kind = Number(String.fromCharCode(bytes[1]));

  if (bytes[0] !== 0x50 || !(kind >= 1 && kind <= 6)) {
    throw new Error('Not a Netpbm (PBM/PGM/PPM) file.');
  }

  const bitmap = kind === 1 || kind === 4;
  const { tokens, offset } = pnmTokens(bytes.subarray(2), bitmap ? 2 : 3);
  const [width, height] = tokens.map(Number);
  const maxValue = bitmap ? 1 : Number(tokens[2]);

  if (maxValue > 255) {
    throw new Error('16-bit Netpbm files are not supported.');
  }

  const channels = kind === 3 || kind === 6 ? 3 : 1;
  const samples = pnmSamples(
    bytes.subarray(2),
    kind,
    { width, height, channels },
    offset
  );
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const color = Array.from({ length: 3 }, (_, channel) => {
      const value = samples[index * channels + (channels === 3 ? channel : 0)];
      return bitmap ? (value ? 0 : 255) : (value * 255) / maxValue;
    });
    pixels.set([...color, 255], index * 4);
  }

  return { width, height, pixels };
}

/**
 * Parse an ASCII-art raster: one text row per image row, `.`, space, `0`, `_`
 * and `-` are background and any other character is ink.
 */
export function parseAsciiRaster(text) {
  const rows = text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter((row) => row.trim().length > 0);
  const width = Math.max(0, ...rows.map((row) => row.length));
  const pixels = new Uint8Array(width * rows.length);

  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      pixels[y * width + x] = INK_CHARACTERS.test(char) ? 255 : 0;
    });
  });

  return { width, height: rows.length, pixels };
}

/**
 * Decode any supported image file into a raster accepted by
 * `vectorizeRasterLine`: PNG, Netpbm, a JSON `{ width, height, pixels }`
 * object, or an ASCII-art raster.
 *
 * @param {Uint8Array} bytes - File contents.
 * @returns {{ raster: { width: number, height: number,
 * pixels: ArrayLike<number> }, format: string }} Decoded raster.
 */
export function decodeImage(bytes) {
  if (isPng(bytes)) {
    return { raster: decodePng(bytes), format: 'png' };
  }

  if (bytes[0] === 0x50 && bytes[1] >= 0x31 && bytes[1] <= 0x36) {
    return { raster: decodePnm(bytes), format: 'pnm' };
  }

  const text = Buffer.from(bytes).toString('utf8');

  if (text.trimStart().startsWith('{')) {
    const { width, height, pixels } = JSON.parse(text);
    return { raster: { width, height, pixels }, format: 'json' };
  }

  return { raster: parseAsciiRaster(text), format: 'ascii' };
}

/**
 * Plain JSON view of a vectorization result (drops typed arrays and the
 * in-memory links store).
 */
export function resultToJson(result) {
  return {
    width: result.width,
    height: result.height,
    strokeWidth: result.strokeWidth,
    path: result.path,
    strokes: result.strokes,
    graph: result.graph,
    coverage: result.coverage,
    simplification: result.simplification,
    svg: result.svg,
    lino: result.lino,
  };
}

const NUMBER_OPTIONS = {
  threshold: 'threshold',
  'alpha-threshold': 'alphaThreshold',
  simplify: 'simplifyTolerance',
  'stroke-width': 'strokeWidth',
  'fill-holes': 'fillHoles',
  'look-ahead': 'lookAhead',
  'pen-lift-cost': 'penLiftCost',
  'point-cost': 'pointCost',
  'max-points': 'maxPoints',
};
const BOOLEAN_OPTIONS = {
  'pen-lifts': 'penLifts',
};
const BOOLEAN_VALUES = {
  true: true,
  on: true,
  yes: true,
  1: true,
  false: false,
  off: false,
  no: false,
  0: false,
};
const CHOICE_OPTIONS = {
  foreground: ['dark', 'light', 'auto'],
  curve: ['linear', 'smooth'],
};

function parseNumberParam(name, value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a finite number`);
  }

  return parsed;
}

function parseBooleanParam(name, value) {
  if (!(value in BOOLEAN_VALUES)) {
    throw new Error(`--${name} must be true or false`);
  }

  return BOOLEAN_VALUES[value];
}

function parseChoiceParam(name, value) {
  if (!CHOICE_OPTIONS[name].includes(value)) {
    throw new Error(
      `--${name} must be one of: ${CHOICE_OPTIONS[name].join(', ')}`
    );
  }

  return value;
}

/**
 * Build `vectorizeRasterLine` options from string parameters (CLI flags or
 * URL query parameters). Unknown parameters are ignored.
 *
 * @param {(name: string) => string | null | undefined} read - Reads a
 * parameter by its kebab-case name.
 * @param {{ foreground?: string }} [defaults] - Default option values.
 * @returns {object} Vectorization options.
 */
export function optionsFromParams(read, defaults = {}) {
  const options = { ...defaults };
  const parsers = [
    [NUMBER_OPTIONS, parseNumberParam],
    [BOOLEAN_OPTIONS, parseBooleanParam],
    [
      Object.fromEntries(Object.keys(CHOICE_OPTIONS).map((n) => [n, n])),
      parseChoiceParam,
    ],
  ];

  for (const [names, parse] of parsers) {
    for (const [name, key] of Object.entries(names)) {
      const value = read(name);

      if (name === 'simplify' && value === 'auto') {
        options[key] = 'auto';
      } else if (value !== null && value !== undefined) {
        options[key] = parse(name, value);
      }
    }
  }

  return options;
}

/**
 * Render a vectorization result in one of the output formats shared by the
 * CLI and the HTTP API.
 *
 * @param {object} result - Result of `vectorizeRasterLine`.
 * @param {'json' | 'svg' | 'path' | 'lino'} format - Output format.
 * @returns {{ body: string, contentType: string }} Rendered output.
 */
export function formatResult(result, format = 'json') {
  if (format === 'svg') {
    return { body: result.svg, contentType: 'image/svg+xml' };
  }

  if (format === 'path') {
    return { body: result.path, contentType: 'text/plain; charset=utf-8' };
  }

  if (format === 'lino') {
    return { body: result.lino, contentType: 'text/plain; charset=utf-8' };
  }

  if (format === 'json') {
    return {
      body: JSON.stringify(resultToJson(result), null, 2),
      contentType: 'application/json',
    };
  }

  throw new Error('format must be one of: json, svg, path, lino');
}
