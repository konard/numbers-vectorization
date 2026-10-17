// Writes examples/images/handwritten-38.png: a 420x300 "scan" of a pen-drawn
// 3 and 8 (dark ink on slightly noisy light paper) for the web app's Image
// mode, the CLI and the API server. The 3 has a U-turn in its middle arm and
// the 8 has two overlapping thick loops.
import { writeFileSync } from 'node:fs';

import { encodePng } from '../tests/helpers/images.js';
import { circlePoints, penRaster } from '../tests/helpers/shapes.js';

const WIDTH = 420;
const HEIGHT = 300;

function arc(cx, cy, radius, from, to, count = 32) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / count;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

const three = [
  ...arc(110, 100, 52, -Math.PI * 0.85, Math.PI * 0.5),
  ...arc(110, 202, 56, -Math.PI * 0.5, Math.PI * 0.85),
];
const ink = penRaster(
  WIDTH,
  HEIGHT,
  [three, circlePoints(300, 98, 46, 64), circlePoints(300, 200, 56, 64)],
  9
);
let seed = 7;
const noise = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const rows = Array.from({ length: HEIGHT }, (_, y) =>
  Array.from({ length: WIDTH }, (_, x) =>
    ink.pixels[y * WIDTH + x]
      ? Math.round(30 + noise() * 30)
      : Math.round(225 + noise() * 25)
  )
);

writeFileSync(
  'examples/images/handwritten-38.png',
  encodePng(
    { width: WIDTH, height: HEIGHT, colorType: 0, bitDepth: 8, rows },
    { filter: 4 }
  )
);
