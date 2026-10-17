// Synthetic glyphs covering every path topology the vectorizer must handle.

export function rasterFromRows(rows) {
  return {
    width: rows[0].length,
    height: rows.length,
    pixels: rows
      .join('')
      .split('')
      .map((value) => (value === '#' ? 255 : 0)),
  };
}

export const SHAPES = {
  // A closed loop: one stroke that ends where it starts.
  zero: [
    '..........',
    '...####...',
    '..##..##..',
    '.##....##.',
    '.#......#.',
    '.#......#.',
    '.#......#.',
    '.##....##.',
    '..##..##..',
    '...####...',
    '..........',
  ],
  // Two loops sharing a waist (degree-4 crossing).
  eight: [
    '..........',
    '...####...',
    '..##..##..',
    '..#....#..',
    '..##..##..',
    '...####...',
    '..##..##..',
    '.##....##.',
    '.#......#.',
    '.##....##.',
    '..######..',
    '..........',
  ],
  // A loop with a tail (junction of degree 3).
  six: [
    '..........',
    '.....##...',
    '....##....',
    '...##.....',
    '..##......',
    '..#####...',
    '.##...##..',
    '.#.....#..',
    '.##...##..',
    '..#####...',
    '..........',
  ],
  // Two straight strokes crossing each other.
  plus: [
    '...........',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '.#########.',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '...........',
  ],
  // A T junction: one branch must be drawn with a U-turn.
  tee: [
    '...........',
    '.#########.',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '...........',
  ],
  // Two disconnected strokes.
  equals: [
    '..........',
    '.########.',
    '..........',
    '..........',
    '.########.',
    '..........',
  ],
  // A single ink pixel.
  dot: ['.....', '.....', '..#..', '.....', '.....'],
  // A tiny blob that thins to a single point.
  block: ['....', '.##.', '.##.', '....'],
};

function stampDisk(raster, cx, cy, radius) {
  const { width, height, pixels } = raster;

  for (let y = Math.floor(cy - radius); y <= cy + radius; y += 1) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
      const inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2;

      if (inside && x >= 0 && y >= 0 && x < width && y < height) {
        pixels[y * width + x] = 255;
      }
    }
  }
}

/**
 * Rasterize polylines with a round pen of the given radius, like a pencil
 * drawing in the web app.
 */
export function penRaster(width, height, polylines, radius) {
  const raster = { width, height, pixels: new Uint8Array(width * height) };

  for (const points of polylines) {
    points.forEach(([bx, by], index) => {
      const [ax, ay] = points[Math.max(0, index - 1)];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));

      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        stampDisk(raster, ax + (bx - ax) * t, ay + (by - ay) * t, radius);
      }
    });
  }

  return raster;
}

export function circlePoints(cx, cy, radius, count = 48) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = (index / count) * 2 * Math.PI;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}
