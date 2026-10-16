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
