import { describe, it, expect } from 'test-anywhere';
import { readFileSync } from 'node:fs';

import { runCli } from '../bin/example-package-name.js';
import { rasterToMask, vectorizeRasterLine } from '../src/index.js';
import {
  decodeImage,
  decodePng,
  decodePnm,
  formatResult,
  optionsFromParams,
  parseAsciiRaster,
} from '../src/node.js';
import { startServer } from '../src/server.js';
import { encodePng } from './helpers/images.js';
import { SHAPES } from './helpers/shapes.js';

const ROWS = ['#..', '.#.', '..#'];
const INK = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function ascii(text) {
  return Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
}

function grayRows(rows) {
  return rows.map((row) => [...row].map((char) => (char === '#' ? 0 : 255)));
}

function autoMask(raster) {
  return Array.from(rasterToMask(raster, { foreground: 'auto' }));
}

function captureCli(argv) {
  const out = [];
  const err = [];
  const code = runCli(argv, {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

function hasNetPermission() {
  const deno = globalThis.Deno;
  return (
    !deno || deno.permissions.querySync({ name: 'net' }).state === 'granted'
  );
}

describe('PNG decoding', () => {
  for (const filter of [0, 1, 2, 3, 4]) {
    it(`decodes 8-bit grayscale scanlines with filter ${filter}`, () => {
      const png = encodePng(
        {
          width: 3,
          height: 3,
          colorType: 0,
          bitDepth: 8,
          rows: grayRows(ROWS),
        },
        { filter }
      );
      const raster = decodePng(png);

      expect(raster.width).toBe(3);
      expect(raster.pixels.length).toBe(36);
      expect(autoMask(raster)).toEqual(INK);
    });
  }

  it('decodes RGBA and treats transparent pixels as paper', () => {
    const rows = ROWS.map((row) =>
      [...row].flatMap((char) =>
        char === '#' ? [10, 20, 30, 255] : [0, 0, 0, 0]
      )
    );
    const raster = decodePng(
      encodePng({ width: 3, height: 3, colorType: 6, bitDepth: 8, rows })
    );

    expect(autoMask(raster)).toEqual(INK);
    expect(Array.from(rasterToMask(raster))).toEqual(INK);
  });

  it('decodes 1-bit palette images with a transparency chunk', () => {
    // Palette: 0 = white (transparent), 1 = black. 3 pixels pack in 1 byte.
    const rows = ROWS.map((row) => [
      [...row].reduce(
        (byte, char, x) => byte | ((char === '#' ? 1 : 0) << (7 - x)),
        0
      ),
    ]);
    const raster = decodePng(
      encodePng(
        { width: 3, height: 3, colorType: 3, bitDepth: 1, rows },
        {
          chunks: [
            ['PLTE', [255, 255, 255, 0, 0, 0]],
            ['tRNS', [0]],
          ],
        }
      )
    );

    expect(Array.from(raster.pixels.subarray(0, 8))).toEqual([
      0, 0, 0, 255, 255, 255, 255, 0,
    ]);
    expect(autoMask(raster)).toEqual(INK);
  });

  it('decodes 16-bit grayscale and gray + alpha images', () => {
    const sixteen = grayRows(ROWS).map((row) => row.flatMap((v) => [v, v]));
    const withAlpha = grayRows(ROWS).map((row) => row.flatMap((v) => [v, 255]));

    for (const [colorType, bitDepth, rows] of [
      [0, 16, sixteen],
      [4, 8, withAlpha],
    ]) {
      const raster = decodePng(
        encodePng({ width: 3, height: 3, colorType, bitDepth, rows })
      );
      expect(autoMask(raster)).toEqual(INK);
    }
  });

  it('rejects files that are not PNG', () => {
    expect(() => decodePng(ascii('P1\n1 1\n1'))).toThrow();
  });
});

describe('Netpbm, ASCII and JSON decoding', () => {
  it('decodes plain and raw PBM/PGM/PPM', () => {
    const plainBits = ascii('P1\n# comment\n3 3\n1 0 0\n0 1 0\n0 0 1\n');
    const rawBits = Uint8Array.from([
      ...ascii('P4\n3 3\n'),
      0b10000000,
      0b01000000,
      0b00100000,
    ]);
    const plainGray = ascii('P2\n3 3\n255\n0 255 255\n255 0 255\n255 255 0\n');
    const rawGray = Uint8Array.from([
      ...ascii('P5\n3 3\n255\n'),
      ...grayRows(ROWS).flat(),
    ]);
    const rawColor = Uint8Array.from([
      ...ascii('P6\n3 3\n255\n'),
      ...grayRows(ROWS)
        .flat()
        .flatMap((v) => [v, v, v]),
    ]);

    for (const bytes of [plainBits, rawBits, plainGray, rawGray, rawColor]) {
      expect(autoMask(decodePnm(bytes))).toEqual(INK);
    }
  });

  it('parses ASCII-art rasters and JSON rasters', () => {
    const fromAscii = parseAsciiRaster('#..\n.#.\n..#\n');
    const fromJson = decodeImage(
      ascii(
        JSON.stringify({ width: 3, height: 3, pixels: INK.map((v) => v * 255) })
      )
    );

    expect(Array.from(rasterToMask(fromAscii))).toEqual(INK);
    expect(fromJson.format).toBe('json');
    expect(Array.from(rasterToMask(fromJson.raster))).toEqual(INK);
    expect(decodeImage(ascii(SHAPES.zero.join('\n'))).format).toBe('ascii');
  });

  it('detects polarity and picks an Otsu threshold in auto mode', () => {
    const dark = { width: 3, height: 3, pixels: grayRows(ROWS).flat() };
    const light = {
      width: 3,
      height: 3,
      pixels: grayRows(ROWS)
        .flat()
        .map((v) => 255 - v),
    };

    expect(autoMask(dark)).toEqual(INK);
    expect(autoMask(light)).toEqual(INK);
  });

  it('parses and validates string options', () => {
    const params = { threshold: '100', curve: 'smooth', simplify: '0.5' };
    const options = optionsFromParams((name) => params[name], {
      foreground: 'auto',
    });

    expect(options).toEqual({
      foreground: 'auto',
      threshold: 100,
      curve: 'smooth',
      simplifyTolerance: 0.5,
    });
    expect(() => optionsFromParams((name) => ({ curve: 'x' })[name])).toThrow();
    expect(() =>
      optionsFromParams((name) => ({ threshold: 'abc' })[name])
    ).toThrow();
  });

  it('parses the pen lift options', () => {
    const params = { 'pen-lifts': 'off', 'pen-lift-cost': '4' };

    expect(optionsFromParams((name) => params[name])).toEqual({
      penLifts: false,
      penLiftCost: 4,
    });
    expect(
      optionsFromParams((name) => ({ 'pen-lifts': 'true' })[name])
    ).toEqual({ penLifts: true });
    expect(() =>
      optionsFromParams((name) => ({ 'pen-lifts': 'maybe' })[name])
    ).toThrow();
  });

  it('parses the simplification options', () => {
    const params = { simplify: 'auto', 'point-cost': '2', 'max-points': '1' };

    expect(optionsFromParams((name) => params[name])).toEqual({
      simplifyTolerance: 'auto',
      pointCost: 2,
      maxPoints: 1,
    });
    expect(() =>
      optionsFromParams((name) => ({ 'max-points': 'many' })[name])
    ).toThrow();
  });

  it('formats results as json, svg, path and lino', () => {
    const result = vectorizeRasterLine(parseAsciiRaster(SHAPES.six.join('\n')));
    const json = JSON.parse(formatResult(result, 'json').body);

    expect(json.coverage.skeleton).toBe(1);
    expect(json.mask).toBe(undefined);
    expect(json.simplification.tolerance).toBe('auto');
    expect(formatResult(result, 'svg').contentType).toBe('image/svg+xml');
    expect(formatResult(result, 'path').body).toBe(result.path);
    expect(formatResult(result, 'lino').body).toBe(result.lino);
    expect(() => formatResult(result, 'gif')).toThrow();
  });
});

describe('vectorize CLI command', () => {
  it('vectorizes example images in every output format', () => {
    for (const file of [
      'examples/images/mnist-8.png',
      'examples/images/mnist-8.pgm',
    ]) {
      const svg = captureCli(['vectorize', file]);
      const json = captureCli(['vectorize', file, '--format', 'json']);
      const lino = captureCli(['vectorize', file, '--format=lino']);

      expect(svg.code).toBe(0);
      expect(svg.stdout.startsWith('<svg')).toBe(true);
      expect(JSON.parse(json.stdout).coverage.skeleton).toBe(1);
      expect(lino.stdout.startsWith('(raster: size 28 28)')).toBe(true);
    }
  });

  it('produces the same strokes for both polarities of the same digit', () => {
    const fromPng = captureCli([
      'vectorize',
      'examples/images/mnist-6.png',
      '--format',
      'path',
    ]);
    const fromPgm = captureCli([
      'vectorize',
      'examples/images/mnist-6.pgm',
      '--format',
      'path',
    ]);

    expect(fromPng.stdout).toBe(fromPgm.stdout);
  });

  it('reports usage errors', () => {
    expect(captureCli(['vectorize']).code).toBe(1);
    expect(
      captureCli([
        'vectorize',
        'examples/images/mnist-8.png',
        '--curve',
        'wavy',
      ]).stderr
    ).toContain('--curve must be one of');
    expect(captureCli(['--help']).stdout).toContain('vectorize <file|->');
  });
});

describe('HTTP API server', () => {
  const run = hasNetPermission() ? it : it.skip;

  run('serves health checks and vectorizes PNG and JSON bodies', async () => {
    const server = await startServer({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
      const health = await (await fetch(`${base}/health`)).json();
      expect(health.status).toBe('ok');

      const png = readFileSync('examples/images/mnist-4.png');
      const svgResponse = await fetch(`${base}/vectorize?format=svg`, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: png,
      });
      expect(svgResponse.status).toBe(200);
      expect(svgResponse.headers.get('content-type')).toBe('image/svg+xml');
      expect((await svgResponse.text()).startsWith('<svg')).toBe(true);

      const jsonResponse = await fetch(`${base}/vectorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          width: 10,
          height: 11,
          pixels: SHAPES.zero
            .join('')
            .split('')
            .map((c) => (c === '#' ? 255 : 0)),
          options: { curve: 'smooth' },
        }),
      });
      const result = await jsonResponse.json();
      expect(result.strokes.length).toBe(1);
      expect(result.path.includes(' C ')).toBe(true);

      const bad = await fetch(`${base}/vectorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"width": -1}',
      });
      expect(bad.status).toBe(400);
      expect((await fetch(`${base}/nope`)).status).toBe(404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
