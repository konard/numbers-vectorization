import { labelComponents } from './raster.js';

export const NEIGHBOR_OFFSETS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function get(mask, width, x, y) {
  return mask[y * width + x];
}

function paddedMask(mask, width, height) {
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const padded = new Uint8Array(paddedWidth * paddedHeight);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      padded[(y + 1) * paddedWidth + x + 1] = mask[y * width + x];
    }
  }

  return { mask: padded, width: paddedWidth, height: paddedHeight };
}

function cropMask(mask, width, height) {
  const croppedWidth = width - 2;
  const croppedHeight = height - 2;
  const cropped = new Uint8Array(croppedWidth * croppedHeight);

  for (let y = 0; y < croppedHeight; y += 1) {
    for (let x = 0; x < croppedWidth; x += 1) {
      cropped[y * croppedWidth + x] = mask[(y + 1) * width + x + 1];
    }
  }

  return cropped;
}

function neighborValues(mask, width, x, y) {
  return NEIGHBOR_OFFSETS.map(([dx, dy]) => get(mask, width, x + dx, y + dy));
}

function countForegroundNeighbors(values) {
  return values.reduce((count, value) => count + value, 0);
}

function countZeroToOneTransitions(values) {
  let transitions = 0;

  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    const next = values[(index + 1) % values.length];

    if (current === 0 && next === 1) {
      transitions += 1;
    }
  }

  return transitions;
}

function collectZhangSuenRemovals(mask, width, height, step) {
  const removals = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (get(mask, width, x, y) === 0) {
        continue;
      }

      const values = neighborValues(mask, width, x, y);
      const neighbors = countForegroundNeighbors(values);

      if (neighbors < 2 || neighbors > 6) {
        continue;
      }

      if (countZeroToOneTransitions(values) !== 1) {
        continue;
      }

      const [p2, , p4, , p6, , p8] = values;
      const firstPass = p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0;
      const secondPass = p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;

      if ((step === 0 && firstPass) || (step === 1 && secondPass)) {
        removals.push(y * width + x);
      }
    }
  }

  return removals;
}

function zhangSuen(mask, width, height) {
  const padded = paddedMask(mask, width, height);
  let changed = true;

  while (changed) {
    changed = false;

    for (let step = 0; step < 2; step += 1) {
      const removals = collectZhangSuenRemovals(
        padded.mask,
        padded.width,
        padded.height,
        step
      );

      if (removals.length > 0) {
        changed = true;
        removals.forEach((index) => {
          padded.mask[index] = 0;
        });
      }
    }
  }

  return cropMask(padded.mask, padded.width, padded.height);
}

function pixelNearestCentroid(pixels, width) {
  let sumX = 0;
  let sumY = 0;

  pixels.forEach((index) => {
    sumX += index % width;
    sumY += Math.floor(index / width);
  });

  const centerX = sumX / pixels.length;
  const centerY = sumY / pixels.length;
  let best = pixels[0];
  let bestDistance = Infinity;

  pixels.forEach((index) => {
    const distance = Math.hypot(
      (index % width) - centerX,
      Math.floor(index / width) - centerY
    );

    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });

  return best;
}

/**
 * Thin a binary mask to a one-pixel centerline with the Zhang-Suen algorithm.
 *
 * Zhang-Suen erases some tiny blobs completely (a 2x2 square is the classic
 * example). Every 8-connected foreground component that vanished is restored
 * as a single pixel near its centroid, so no ink is ever lost from the
 * skeleton and every component can still be vectorized.
 *
 * @param {Uint8Array} mask - Binary mask in row-major order.
 * @param {number} width - Raster width.
 * @param {number} height - Raster height.
 * @returns {Uint8Array} Skeletonized mask.
 */
export function thinRasterMask(mask, width, height) {
  const skeleton = zhangSuen(mask, width, height);
  const { components } = labelComponents(mask, width, height);

  components.forEach((component) => {
    if (component.pixels.some((index) => skeleton[index] === 1)) {
      return;
    }

    skeleton[pixelNearestCentroid(component.pixels, width)] = 1;
  });

  return skeleton;
}
