import { describe, it, expect } from 'test-anywhere';
import { readFileSync } from 'node:fs';
import { Parser } from 'links-notation';

import { simplifyCenterline } from '../src/geometry.js';

import {
  beginPenStroke,
  createPenRecording,
  extendPenStroke,
  isPenRecordingText,
  parsePenRecording,
  penRecordingDuration,
  penRecordingSegments,
  penRecordingToLinksNotation,
  rasterizePenRecording,
  vectorizeRasterLine,
} from '../src/index.js';

// The web app pencil settings for drawn rasters.
const DRAW_OPTIONS = { threshold: 32, alphaThreshold: 24 };

/** A plus drawn as two strokes, sampled every 4 px and 8 ms. */
function recordPlus() {
  const recording = createPenRecording({ width: 140, height: 140 });
  const lines = [
    [
      [30, 70],
      [110, 70],
    ],
    [
      [70, 30],
      [70, 110],
    ],
  ];
  let t = 0;

  lines.forEach(([[x1, y1], [x2, y2]], index) => {
    const steps = 20;

    for (let step = 0; step <= steps; step += 1) {
      const point = {
        x: x1 + ((x2 - x1) * step) / steps,
        y: y1 + ((y2 - y1) * step) / steps,
        t,
        pressure: 0.2,
      };

      if (step === 0) {
        beginPenStroke(recording, point, index === 0 ? 'mouse' : 'pen');
      } else {
        extendPenStroke(recording, point);
      }
      t += 8;
    }
    t += 300;
  });

  return recording;
}

/** Ink area in pixels: the summed anti-aliased coverage. */
function inkArea(raster) {
  let area = 0;

  for (let index = 3; index < raster.pixels.length; index += 4) {
    area += raster.pixels[index] / 255;
  }

  return area;
}

describe('pen movement recording (issue 7)', () => {
  it('records timed samples per stroke', () => {
    const recording = recordPlus();

    expect(recording.strokes.length).toBe(2);
    expect(recording.strokes[0].samples.length).toBe(21);
    expect(recording.strokes[1].pointer).toBe('pen');
    expect(recording.strokes[0].samples[0]).toEqual({
      x: 30,
      y: 70,
      t: 0,
      pressure: 0.2,
    });
    // Two strokes of 20 steps of 8 ms with a 300 ms pause between them.
    expect(penRecordingDuration(recording)).toBe(160 + 8 + 300 + 160);
    expect(penRecordingSegments(recording).length).toBe(42);
    expect(() =>
      extendPenStroke(createPenRecording({ width: 1, height: 1 }), {
        x: 0,
        y: 0,
        t: 0,
      })
    ).toThrow();
  });

  it('round-trips through JSON and indented Links Notation', () => {
    const recording = { ...recordPlus(), options: { threshold: 32 } };
    const lino = penRecordingToLinksNotation(recording);

    expect(parsePenRecording(JSON.stringify(recording))).toEqual(recording);
    expect(parsePenRecording(lino)).toEqual(recording);
    expect(isPenRecordingText(lino)).toBe(true);
    expect(isPenRecordingText(JSON.stringify(recording))).toBe(true);
    expect(isPenRecordingText('{"width": 1}')).toBe(false);
  });

  it('writes Links Notation that nests strokes and samples', () => {
    const lino = penRecordingToLinksNotation(recordPlus());
    const [root] = new Parser().parseGroups(lino);
    const strokes = root.children.find(
      (group) => group.element.id === 'strokes'
    );
    const samples = strokes.children[0].children.find(
      (group) => group.element.id === 'samples'
    );

    expect(root.element.id).toBe('recording');
    expect(
      lino.startsWith('recording:\n  canvas 140 140\n  brush 9 18\n')
    ).toBe(true);
    expect(strokes.children.length).toBe(2);
    expect(samples.children.length).toBe(21);
    expect(lino.includes('\n        30 70 0 0.2\n')).toBe(true);
  });

  it('rejects documents that are not recordings', () => {
    expect(() => parsePenRecording('{"type": "image"}')).toThrow();
    expect(() => parsePenRecording('raster:\n  size 1 1')).toThrow();
    expect(() =>
      parsePenRecording(
        '{"type": "pen-recording", "width": 0, "height": 5, "strokes": []}'
      )
    ).toThrow();
    expect(() =>
      parsePenRecording(
        'recording:\n  canvas 5 5\n  strokes:\n    stroke1:\n      samples:\n        1 x 0 0.5'
      )
    ).toThrow();
  });

  it('rasterizes a recording the way the pencil drew it', () => {
    const recording = recordPlus();
    const raster = rasterizePenRecording(recording);
    const firstStroke = rasterizePenRecording(recording, { until: 200 });
    // One stroke: an 80 px line with a 12.6 px pen and round caps.
    const expected = 80 * 12.6 + Math.PI * 6.3 * 6.3;

    expect(raster.pixels.length).toBe(140 * 140 * 4);
    expect(Math.abs(inkArea(firstStroke) - expected) < expected * 0.01).toBe(
      true
    );
    expect(inkArea(raster) > inkArea(firstStroke) * 1.6).toBe(true);
  });

  it('vectorizes a replayed recording as the strokes that were drawn', () => {
    const result = vectorizeRasterLine(
      rasterizePenRecording(recordPlus()),
      DRAW_OPTIONS
    );

    expect(result.strokes.length).toBe(2);
    expect(result.coverage.links.traversed).toBe(result.coverage.links.total);
    for (const stroke of result.strokes) {
      expect(stroke.points.length).toBe(2);
    }
  });

  it('draws a slanted stroke straight through the bar that crosses it', () => {
    // examples/recordings/seven-barred.lino: a 7 and the bar across its
    // diagonal. The crossing must not bend the diagonal (3 + 2 points).
    const recording = parsePenRecording(
      readFileSync('examples/recordings/seven-barred.lino', 'utf8')
    );
    const result = vectorizeRasterLine(
      rasterizePenRecording(recording),
      recording.options
    );

    expect(recording.options).toEqual(DRAW_OPTIONS);
    expect(result.strokes.map((stroke) => stroke.points.length)).toEqual([
      3, 2,
    ]);
    expect(result.coverage.links.traversed).toBe(result.coverage.links.total);
  });
});

describe('corners and jogs (issue 7)', () => {
  // A line that steps 4 px sideways and carries on, like a stroke routed
  // through the junction where another stroke crosses it.
  const jog = [
    ...Array.from({ length: 21 }, (_, x) => ({ x, y: 0 })),
    { x: 21, y: 2 },
    ...Array.from({ length: 21 }, (_, x) => ({ x: 22 + x, y: 4 })),
  ];

  it('keeps sharp corners when no pen width is given', () => {
    expect(simplifyCenterline(jog, 5).length > 2).toBe(true);
  });

  it('simplifies a jog narrower than the pen like any other point', () => {
    expect(simplifyCenterline(jog, 5, 12)).toEqual([jog[0], jog.at(-1)]);
  });

  it('keeps a real corner even within one pen width', () => {
    const corner = [
      ...Array.from({ length: 21 }, (_, x) => ({ x, y: 0 })),
      ...Array.from({ length: 20 }, (_, y) => ({ x: 20, y: y + 1 })),
    ];

    expect(simplifyCenterline(corner, 5, 12)).toEqual([
      corner[0],
      corner[20],
      corner.at(-1),
    ]);
  });
});
