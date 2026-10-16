// Minimal PNG and Netpbm encoders used to test the image decoders.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typed = Uint8Array.from([...type].map((char) => char.charCodeAt(0)));
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typed, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((value) =>
    Math.abs(estimate - value)
  );

  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }

  return toUp <= toUpLeft ? up : upLeft;
}

function filterRows(rows, filter, bytesPerPixel) {
  return rows.map((row, y) => [
    filter,
    ...row.map((value, x) => {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = y > 0 ? rows[y - 1][x] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel ? rows[y - 1][x - bytesPerPixel] : 0;
      const predictor = [
        0,
        left,
        up,
        (left + up) >> 1,
        paeth(left, up, upLeft),
      ];
      return (value - predictor[filter] + 256) & 0xff;
    }),
  ]);
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Encode packed scanline bytes as a PNG. Every row uses PNG filter `filter`
 * (0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth) to exercise the decoder.
 */
export function encodePng(image, { filter = 0, chunks = [] } = {}) {
  const { width, height, colorType, bitDepth, rows } = image;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([bitDepth, colorType, 0, 0, 0], 8);
  const bytesPerPixel = Math.max(1, (CHANNELS[colorType] * bitDepth) / 8);
  const raw = concat(
    filterRows(rows, filter, bytesPerPixel).map((row) => Uint8Array.from(row))
  );

  return concat([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...chunks.map(([type, data]) => chunk(type, Uint8Array.from(data))),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Rows of `#`/`.` → 8-bit grayscale scanlines (ink = 0, paper = 255). */
export function asciiToGrayRows(rows) {
  return rows.map((row) => [...row].map((char) => (char === '#' ? 0 : 255)));
}
