// Decodes the 50 bundled MNIST samples used by the web app into rasters.
import {
  MNIST_SAMPLE_COUNT,
  MNIST_SAMPLE_HEIGHT,
  MNIST_SAMPLE_LABELS,
  MNIST_SAMPLE_PIXELS_BASE64,
  MNIST_SAMPLE_WIDTH,
} from '../../examples/universal-app/src/mnistSamples.js';

export function loadBundledMnistSamples() {
  const bytes = Uint8Array.from(
    globalThis.atob(MNIST_SAMPLE_PIXELS_BASE64),
    (character) => character.charCodeAt(0)
  );
  const size = MNIST_SAMPLE_WIDTH * MNIST_SAMPLE_HEIGHT;

  return Array.from({ length: MNIST_SAMPLE_COUNT }, (_, index) => ({
    index,
    label: MNIST_SAMPLE_LABELS[index],
    raster: {
      width: MNIST_SAMPLE_WIDTH,
      height: MNIST_SAMPLE_HEIGHT,
      pixels: bytes.subarray(index * size, (index + 1) * size),
    },
  }));
}
