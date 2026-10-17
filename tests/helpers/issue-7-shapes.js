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
