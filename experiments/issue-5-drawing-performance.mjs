// Times vectorizeRasterLine on thick round-pen drawings like the web app's
// 280x280 Draw mode, and checks that the overlapping loops of a drawn 8 get
// no completion stubs (U-turns on the spot) at any scale.
import { vectorizeRasterLine } from '../src/index.js';
import { circlePoints, penRaster } from '../tests/helpers/shapes.js';

const { performance } = globalThis;

function toRgba({ width, height, pixels }) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((value, index) => {
    if (value) {
      rgba.set([16, 24, 32, 255], index * 4);
    }
  });
  return { width, height, pixels: rgba };
}

function report(name, raster, options) {
  const started = performance.now();
  const result = vectorizeRasterLine(raster, options);
  const elapsed = performance.now() - started;
  const completed = result.links
    .edges()
    .filter((edge) => result.links.getData(edge).completed).length;
  console.log(
    name,
    `${elapsed.toFixed(0)} ms`,
    `pen=${result.coverage.penWidth}`,
    `strokes=${result.strokes.length}`,
    `edges=${result.coverage.edges.traversed}/${result.coverage.edges.total}`,
    `completed=${completed}`,
    `mask=${result.coverage.mask.toFixed(3)}`,
    `retrace=${result.strokes.map((s) => s.retraceLength).join(',')}`
  );
}

const canvas = { alphaThreshold: 24, threshold: 32 };
const eight = [circlePoints(140, 85, 50, 64), circlePoints(140, 190, 60, 64)];
const four = [
  [
    [90, 40],
    [60, 170],
    [220, 170],
  ],
  [
    [180, 40],
    [180, 250],
  ],
];

report('canvas eight', toRgba(penRaster(280, 280, eight, 9)), canvas);
report('canvas four', toRgba(penRaster(280, 280, four, 10)), canvas);

for (const scale of [1, 1.5, 2, 3]) {
  const size = Math.round(100 * scale);
  const loops = [
    circlePoints(50 * scale, 30 * scale, 18 * scale),
    circlePoints(50 * scale, 68 * scale, 22 * scale),
  ];
  report(`eight x${scale}`, penRaster(size, size, loops, 3.5 * scale));
}
