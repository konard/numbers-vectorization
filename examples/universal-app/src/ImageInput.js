import { createElement as h, useCallback, useState } from 'react';

/** Longest side of an uploaded image after downscaling. */
export const IMAGE_SIZE = 280;

async function loadImageRaster(file) {
  const bitmap = await globalThis.createImageBitmap(file);
  const scale = Math.min(1, IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return {
    width,
    height,
    pixels: new Uint8ClampedArray(
      context.getImageData(0, 0, width, height).data
    ),
  };
}

/**
 * Upload a photo, scan or PNG of handwriting. The image is downscaled to at
 * most 280 px and vectorized with `foreground: 'auto'`, so dark-on-light and
 * light-on-dark images both work and the threshold comes from Otsu's method.
 */
export function ImageInput({ name, onImageChange }) {
  const [error, setError] = useState('');

  const handleChange = useCallback(
    async (event) => {
      const [file] = event.target.files ?? [];

      if (!file) {
        return;
      }

      try {
        setError('');
        onImageChange(await loadImageRaster(file), file.name);
      } catch {
        setError(`Could not read ${file.name} as an image.`);
      }
    },
    [onImageChange]
  );

  return h(
    'section',
    { className: 'drawing-section', 'aria-labelledby': 'image-title' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', { id: 'image-title' }, 'Image input')
    ),
    h(
      'label',
      { className: 'upload-control' },
      h('span', null, name || 'Choose a PNG, JPEG or WebP image'),
      h('input', {
        type: 'file',
        accept: 'image/*',
        onChange: handleChange,
      })
    ),
    h(
      'p',
      { className: error ? 'settings-note settings-error' : 'settings-note' },
      error ||
        'Scaled to 280 px. Ink polarity and threshold are detected automatically (Otsu).'
    )
  );
}
