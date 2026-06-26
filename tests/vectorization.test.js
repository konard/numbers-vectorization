import { describe, it, expect } from 'test-anywhere';
import { createSvgDocument, vectorizeRasterLine } from '../src/index.js';

function rasterFromRows(rows) {
  return {
    width: rows[0].length,
    height: rows.length,
    pixels: rows
      .join('')
      .split('')
      .map((value) => (value === '#' ? 255 : 0)),
  };
}

function firstPoint(points) {
  return points[0];
}

function lastPoint(points) {
  return points.at(-1);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('single raster line vectorization', () => {
  it('extracts a centerline path from a thick diagonal raster stroke', () => {
    const raster = rasterFromRows([
      '##.....',
      '###....',
      '.###...',
      '..###..',
      '...###.',
      '....###',
      '.....##',
    ]);

    const result = vectorizeRasterLine(raster, { simplifyTolerance: 0.25 });

    expect(result.width).toBe(7);
    expect(result.height).toBe(7);
    expect(result.points.length >= 2).toBe(true);
    expect(result.path.startsWith('M ')).toBe(true);
    expect(result.strokeWidth > 1).toBe(true);
    expect(result.svg.includes('<path')).toBe(true);
    expect(distance(firstPoint(result.points), { x: 0, y: 0 }) < 2).toBe(true);
    expect(distance(lastPoint(result.points), { x: 6, y: 6 }) < 2).toBe(true);
  });

  it('preserves the corner of a one-stroke right-angle raster', () => {
    const raster = rasterFromRows([
      '##.....',
      '##.....',
      '##.....',
      '#####..',
      '..###..',
      '...##..',
      '...##..',
    ]);

    const result = vectorizeRasterLine(raster, { simplifyTolerance: 0.75 });
    const hasCorner = result.points.some(
      (point) => distance(point, { x: 1, y: 3 }) <= 1.5
    );

    expect(result.points.length >= 3).toBe(true);
    expect(hasCorner).toBe(true);
    expect(result.path.includes(' L ')).toBe(true);
  });

  it('accepts RGBA image data and ignores low-alpha pixels', () => {
    const width = 5;
    const height = 5;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let index = 0; index < width; index += 1) {
      const offset = (index * width + index) * 4;
      pixels[offset] = 20;
      pixels[offset + 1] = 20;
      pixels[offset + 2] = 20;
      pixels[offset + 3] = 255;
    }

    const ignoredOffset = (0 * width + 4) * 4;
    pixels[ignoredOffset] = 0;
    pixels[ignoredOffset + 3] = 20;

    const result = vectorizeRasterLine({ width, height, pixels });

    expect(result.mask.filter(Boolean).length).toBe(5);
    expect(result.points.length >= 2).toBe(true);
    expect(distance(firstPoint(result.points), { x: 0, y: 0 }) < 1).toBe(true);
    expect(distance(lastPoint(result.points), { x: 4, y: 4 }) < 1).toBe(true);
  });

  it('supports dark foreground pixels in one-channel rasters', () => {
    const result = vectorizeRasterLine(
      {
        width: 5,
        height: 5,
        pixels: new Uint8Array([
          0, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255, 255, 0, 255, 255,
          255, 255, 255, 0, 255, 255, 255, 255, 255, 0,
        ]),
      },
      { foreground: 'dark', threshold: 32 }
    );

    expect(result.mask.filter(Boolean).length).toBe(5);
    expect(result.points.length >= 2).toBe(true);
  });

  it('returns an empty SVG path for a blank raster', () => {
    const result = vectorizeRasterLine({
      width: 4,
      height: 4,
      pixels: new Uint8Array(16),
    });

    expect(result.path).toBe('');
    expect(result.points.length).toBe(0);
    expect(result.svg.includes('<svg')).toBe(true);
  });

  it('creates a standalone SVG document for vectorization output', () => {
    const result = vectorizeRasterLine(
      rasterFromRows(['#....', '.#...', '..#..', '...#.', '....#']),
      { strokeWidth: 2 }
    );
    const svg = createSvgDocument(result, { title: 'Diagonal sample' });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.includes('<title>Diagonal sample</title>')).toBe(true);
    expect(svg.includes('stroke-width="2"')).toBe(true);
  });
});
