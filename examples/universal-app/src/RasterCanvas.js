import { createElement as h, useEffect, useRef } from 'react';

/** Paint a one-channel (ink alpha) or RGBA raster onto a canvas. */
export function drawRaster(canvas, raster) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const image = context.createImageData(raster.width, raster.height);
  const rgba = raster.pixels.length === raster.width * raster.height * 4;

  for (let index = 0; index < raster.width * raster.height; index += 1) {
    const target = index * 4;

    if (rgba) {
      const source = target;
      image.data[target] = raster.pixels[source];
      image.data[target + 1] = raster.pixels[source + 1];
      image.data[target + 2] = raster.pixels[source + 2];
      image.data[target + 3] = raster.pixels[source + 3];
    } else {
      const alpha = raster.pixels[index];
      image.data[target] = 18;
      image.data[target + 1] = 25;
      image.data[target + 2] = 33;
      image.data[target + 3] = alpha;
    }
  }

  canvas.width = raster.width;
  canvas.height = raster.height;
  context.putImageData(image, 0, 0);
}

export function RasterCanvas({ raster, className, title }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawRaster(canvasRef.current, raster);
    }
  }, [raster]);

  return h('canvas', {
    ref: canvasRef,
    className,
    title,
    width: raster.width,
    height: raster.height,
  });
}
