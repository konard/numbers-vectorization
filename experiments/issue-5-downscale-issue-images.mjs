// Downscales the five 3654x2256 screenshots attached to issue #5 by 4x (box
// filter) so they can live in docs/case-studies/issue-5/images without
// bloating the repository.
//
// Usage: node experiments/issue-5-downscale-issue-images.mjs <input.png>...
// Writes <case-study>/images/issue-<n>.png for the n-th input.
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

import { decodePng } from '../src/node.js';
import { encodePng } from '../tests/helpers/images.js';

const FACTOR = 4;
const OUTPUT = new URL('../docs/case-studies/issue-5/images/', import.meta.url);

function downscale({ width, height, pixels }) {
  const outWidth = Math.floor(width / FACTOR);
  const outHeight = Math.floor(height / FACTOR);
  const rows = [];

  for (let y = 0; y < outHeight; y += 1) {
    const row = [];

    for (let x = 0; x < outWidth; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;

        for (let dy = 0; dy < FACTOR; dy += 1) {
          for (let dx = 0; dx < FACTOR; dx += 1) {
            const index =
              ((y * FACTOR + dy) * width + x * FACTOR + dx) * 4 + channel;
            sum += pixels[index];
          }
        }

        row.push(Math.round(sum / FACTOR ** 2));
      }
    }

    rows.push(row);
  }

  return {
    width: outWidth,
    height: outHeight,
    colorType: 2,
    bitDepth: 8,
    rows,
  };
}

process.argv.slice(2).forEach((file, index) => {
  const image = downscale(decodePng(new Uint8Array(readFileSync(file))));
  const target = new URL(`issue-${index + 1}.png`, OUTPUT);
  writeFileSync(target, encodePng(image, { filter: 4 }));
  console.log(file, '->', target.pathname, `${image.width}x${image.height}`);
});
