const DEFAULT_THRESHOLD = 32;
const DEFAULT_RGBA_THRESHOLD = 224;
const DEFAULT_ALPHA_THRESHOLD = 64;

export function assertRasterShape(raster) {
  if (!raster || !Number.isInteger(raster.width) || raster.width <= 0) {
    throw new TypeError('Raster width must be a positive integer.');
  }

  if (!Number.isInteger(raster.height) || raster.height <= 0) {
    throw new TypeError('Raster height must be a positive integer.');
  }

  const pixels = raster.pixels ?? raster.data;

  if (!pixels || typeof pixels.length !== 'number') {
    throw new TypeError('Raster pixels must be an array or typed array.');
  }

  const pixelCount = raster.width * raster.height;

  if (pixels.length !== pixelCount && pixels.length !== pixelCount * 4) {
    throw new RangeError(
      `Raster pixels length must be ${pixelCount} or ${pixelCount * 4}.`
    );
  }

  return pixels;
}

function isPixelActive(value, options) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  if (options.foreground === 'dark') {
    return value <= threshold;
  }

  return value >= threshold;
}

function isRgbaPixelActive(pixels, offset, options) {
  const alpha = pixels[offset + 3] ?? 255;
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;

  if (alpha < alphaThreshold) {
    return false;
  }

  const red = pixels[offset] ?? 0;
  const green = pixels[offset + 1] ?? red;
  const blue = pixels[offset + 2] ?? red;
  const luminance = (red + green + blue) / 3;
  const threshold = options.threshold ?? DEFAULT_RGBA_THRESHOLD;

  if (options.foreground === 'light') {
    return luminance >= threshold;
  }

  return luminance <= threshold;
}

/**
 * Convert a grayscale, binary, or RGBA raster into a 0/1 foreground mask.
 *
 * One-channel rasters use non-zero, light-on-dark semantics by default because
 * MNIST stores digits as bright pixels on a dark background. RGBA rasters use
 * dark-stroke semantics by default because browser pencil input is normally
 * rasterized as dark ink on transparent canvas.
 *
 * @param {{ width: number, height: number, pixels?: ArrayLike<number>,
 * data?: ArrayLike<number> }} raster - Raster image data.
 * @param {{ threshold?: number, alphaThreshold?: number,
 * foreground?: 'dark' | 'light' }} [options] - Thresholding options.
 * @returns {Uint8Array} Binary mask in row-major order.
 */
export function rasterToMask(raster, options = {}) {
  const pixels = assertRasterShape(raster);
  const pixelCount = raster.width * raster.height;
  const mask = new Uint8Array(pixelCount);

  if (pixels.length === pixelCount * 4) {
    for (let index = 0; index < pixelCount; index += 1) {
      mask[index] = isRgbaPixelActive(pixels, index * 4, options) ? 1 : 0;
    }

    return mask;
  }

  for (let index = 0; index < pixelCount; index += 1) {
    mask[index] = isPixelActive(pixels[index], options) ? 1 : 0;
  }

  return mask;
}

const FOUR_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const EIGHT_OFFSETS = [...FOUR_OFFSETS, [1, -1], [1, 1], [-1, 1], [-1, -1]];

function isBorderPixel(index, width, height) {
  const x = index % width;
  const y = (index - x) / width;

  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

function inBoundsNeighbors(index, width, height, offsets) {
  const x = index % width;
  const y = (index - x) / width;

  return offsets
    .map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height)
    .map(([nx, ny]) => ny * width + nx);
}

/**
 * Label connected components of pixels whose mask value equals `value`.
 *
 * @returns {{ labels: Int32Array, components: { pixels: number[],
 * touchesBorder: boolean }[] }} Label 0 means "not part of a component";
 * component `n` has label `n + 1`.
 */
export function labelComponents(mask, width, height, options = {}) {
  const value = options.value ?? 1;
  const offsets = options.connectivity === 4 ? FOUR_OFFSETS : EIGHT_OFFSETS;
  const labels = new Int32Array(mask.length);
  const components = [];

  for (let seed = 0; seed < mask.length; seed += 1) {
    if (mask[seed] !== value || labels[seed] !== 0) {
      continue;
    }

    const label = components.length + 1;
    const pixels = [seed];
    labels[seed] = label;

    for (let cursor = 0; cursor < pixels.length; cursor += 1) {
      for (const neighbor of inBoundsNeighbors(
        pixels[cursor],
        width,
        height,
        offsets
      )) {
        if (mask[neighbor] === value && labels[neighbor] === 0) {
          labels[neighbor] = label;
          pixels.push(neighbor);
        }
      }
    }

    components.push({
      pixels,
      touchesBorder: pixels.some((index) =>
        isBorderPixel(index, width, height)
      ),
    });
  }

  return { labels, components };
}

/**
 * Fill enclosed background holes whose area is at most `maxArea` pixels.
 *
 * Anti-aliased handwriting often contains one- or two-pixel pinholes inside
 * thick strokes. Thinning preserves every hole as a loop, so these pinholes
 * would otherwise become tiny fake loops in the centerline.
 *
 * @param {Uint8Array} mask - Binary mask in row-major order.
 * @param {number} width - Raster width.
 * @param {number} height - Raster height.
 * @param {number} maxArea - Largest hole area (in pixels) to fill.
 * @returns {Uint8Array} A new mask with small holes filled.
 */
export function fillSmallHoles(mask, width, height, maxArea) {
  const filled = Uint8Array.from(mask);

  if (!(maxArea > 0)) {
    return filled;
  }

  const { components } = labelComponents(mask, width, height, {
    value: 0,
    connectivity: 4,
  });

  for (const component of components) {
    if (!component.touchesBorder && component.pixels.length <= maxArea) {
      component.pixels.forEach((index) => {
        filled[index] = 1;
      });
    }
  }

  return filled;
}
