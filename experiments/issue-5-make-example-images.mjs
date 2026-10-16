// Writes example input images for the CLI, API server and tests from the
// bundled MNIST samples: a plain PGM (P2) and a grayscale PNG with dark ink
// on white paper (the opposite polarity of MNIST, to exercise auto mode).
import { writeFileSync } from 'node:fs';

import { encodePng } from '../tests/helpers/images.js';
import { loadBundledMnistSamples } from '../tests/helpers/mnist-samples.js';

const samples = loadBundledMnistSamples();
const picks = { 'mnist-8': 17, 'mnist-6': 13, 'mnist-4': 9 };

for (const [name, index] of Object.entries(picks)) {
  const { raster } = samples[index];
  const { width, height, pixels } = raster;
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from(pixels.subarray(y * width, (y + 1) * width))
  );
  const pgm = [
    'P2',
    `# MNIST t10k sample ${index}, white ink on black`,
    `${width} ${height}`,
    '255',
    ...rows.map((row) => row.join(' ')),
    '',
  ].join('\n');
  writeFileSync(`examples/images/${name}.pgm`, pgm);
  const inverted = rows.map((row) => row.map((value) => 255 - value));
  writeFileSync(
    `examples/images/${name}.png`,
    encodePng(
      { width, height, colorType: 0, bitDepth: 8, rows: inverted },
      { filter: 4 }
    )
  );
}
