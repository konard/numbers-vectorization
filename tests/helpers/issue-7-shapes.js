// Shapes from issue #7 ("prefer the simplest explanation first").
import { penRaster } from './shapes.js';

// The hand-drawn "4" from issue #7 as one pen movement on a 280 x 280 canvas:
// down, curve right, up into a narrow loop, then down through the bar.

/**
 * @param {number} gap distance between the up and the down line of the loop
 * @returns {Array<[number, number]>}
 */
export function fourStroke(gap) {
  const half = gap / 2;
  const top = 35;
  const turn = Array.from({ length: 9 }, (_, index) => {
    const angle = Math.PI + (index / 8) * Math.PI;
    return [180 + half * Math.cos(angle), top + half * Math.sin(angle) * 0.6];
  });
  // The pen crosses the bar where the loop starts, as a hand-drawn 4 does.
  const crossing = [174 - half * 0.5, 120];

  return [
    [62, 35],
    [63, 80],
    [66, 105],
    [80, 122],
    [110, 128],
    [150, 126],
    crossing,
    [180 - half, 80],
    ...turn,
    [180 + half, 80],
    crossing,
    [190, 180],
    [204, 237],
  ];
}

/**
 * A straight pen line whose middle was pressed harder: the middle is stamped
 * with `wideRadius` instead of the pen's radius 6.
 * @param {number} wideRadius
 */
export function pressureLine(wideRadius) {
  const thin = penRaster(
    200,
    120,
    [
      [
        [20, 60],
        [180, 60],
      ],
    ],
    6
  );
  const wide = penRaster(
    200,
    120,
    [
      [
        [70, 60],
        [130, 60],
      ],
    ],
    wideRadius
  );

  return {
    ...thin,
    pixels: thin.pixels.map((value, index) => value | wide.pixels[index]),
  };
}

/** The "4" rasterized with the pen radius of the issue screenshots' scale. */
export function fourRaster(gap) {
  return penRaster(280, 280, [fourStroke(gap)], 8.7);
}

// Shapes people draw as several pen strokes, each line straight through the
// crossings: the simplest explanation lifts the pen instead of retracing.
export const MULTI_STROKE_SHAPES = {
  plus: [
    [
      [100, 30],
      [100, 170],
    ],
    [
      [30, 100],
      [170, 100],
    ],
  ],
  cross: [
    [
      [40, 40],
      [160, 160],
    ],
    [
      [160, 40],
      [40, 160],
    ],
  ],
  tee: [
    [
      [30, 40],
      [170, 40],
    ],
    [
      [100, 40],
      [100, 170],
    ],
  ],
  // A 7 with a bar through the middle of its leg.
  seven: [
    [
      [40, 30],
      [160, 30],
      [80, 170],
    ],
    [
      [75, 100],
      [145, 100],
    ],
  ],
  // An A: the apex in one stroke, then the bar between the legs.
  letterA: [
    [
      [40, 170],
      [100, 30],
      [160, 170],
    ],
    [
      [68, 110],
      [132, 110],
    ],
  ],
  // A 4 drawn as an "L" and a vertical line crossing its bar.
  openFour: [
    [
      [70, 30],
      [40, 120],
      [170, 120],
    ],
    [
      [130, 50],
      [130, 175],
    ],
  ],
};

/** Rasterize one of the multi-stroke shapes with a web-canvas pen. */
export function multiStrokeRaster(name) {
  return penRaster(200, 200, MULTI_STROKE_SHAPES[name], 6);
}
