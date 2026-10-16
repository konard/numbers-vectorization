const INFINITE = 1e20;

function parabolaIntersection(values, q, v) {
  return (values[q] + q * q - (values[v] + v * v)) / (2 * q - 2 * v);
}

function distanceTransform1d(values, length) {
  const output = new Float64Array(length);
  const locations = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  let count = 0;
  locations[0] = 0;
  boundaries[0] = -INFINITE;
  boundaries[1] = INFINITE;

  for (let q = 1; q < length; q += 1) {
    let s = parabolaIntersection(values, q, locations[count]);

    while (s <= boundaries[count]) {
      count -= 1;
      s = parabolaIntersection(values, q, locations[count]);
    }

    count += 1;
    locations[count] = q;
    boundaries[count] = s;
    boundaries[count + 1] = INFINITE;
  }

  count = 0;

  for (let q = 0; q < length; q += 1) {
    while (boundaries[count + 1] < q) {
      count += 1;
    }

    const v = locations[count];
    output[q] = (q - v) * (q - v) + values[v];
  }

  return output;
}

/**
 * Exact Euclidean distance transform (Felzenszwalb-Huttenlocher) of a binary
 * mask. Each foreground pixel receives the distance from its center to the
 * nearest background pixel center; pixels outside the raster count as
 * background, so a one-pixel-wide line has distance 1 everywhere.
 *
 * @param {Uint8Array} mask - Binary mask in row-major order.
 * @param {number} width - Raster width.
 * @param {number} height - Raster height.
 * @returns {Float64Array} Distance per pixel (0 for background).
 */
export function distanceToBackground(mask, width, height) {
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const grid = new Float64Array(paddedWidth * paddedHeight);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      grid[(y + 1) * paddedWidth + x + 1] = mask[y * width + x] ? INFINITE : 0;
    }
  }

  const column = new Float64Array(paddedHeight);

  for (let x = 0; x < paddedWidth; x += 1) {
    for (let y = 0; y < paddedHeight; y += 1) {
      column[y] = grid[y * paddedWidth + x];
    }

    const transformed = distanceTransform1d(column, paddedHeight);

    for (let y = 0; y < paddedHeight; y += 1) {
      grid[y * paddedWidth + x] = transformed[y];
    }
  }

  const row = new Float64Array(paddedWidth);
  const result = new Float64Array(width * height);

  for (let y = 0; y < paddedHeight; y += 1) {
    for (let x = 0; x < paddedWidth; x += 1) {
      row[x] = grid[y * paddedWidth + x];
    }

    const transformed = distanceTransform1d(row, paddedWidth);

    if (y === 0 || y === paddedHeight - 1) {
      continue;
    }

    for (let x = 1; x < paddedWidth - 1; x += 1) {
      result[(y - 1) * width + x - 1] = Math.sqrt(transformed[x]);
    }
  }

  return result;
}
