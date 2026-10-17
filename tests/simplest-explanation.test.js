import { describe, it, expect } from 'test-anywhere';

import { vectorizeRasterLine } from '../src/index.js';
import { fourRaster, pressureLine } from './helpers/issue-7-shapes.js';

function completedEdges(result) {
  return result.graph.edges.filter((edge) => edge.completed).length;
}

function retrace(result) {
  return result.strokes.reduce((sum, stroke) => sum + stroke.retraceLength, 0);
}

describe('a narrow loop is a loop, not zig-zags (issue 7)', () => {
  // Image 1 of the issue: down, curve right, up, turn, down through the bar.
  // Its simplest network has 3 nodes (two pen ends and the crossing) and 3
  // links (the bar, the loop and the leg). Narrower loops fuse their lines
  // into one blob of ink, which must still be explained by the same network.
  for (const gap of [60, 30, 24, 20, 17, 14, 10, 6, 3]) {
    it(`explains the "4" with a ${gap} px loop as 3 nodes and 3 links`, () => {
      const result = vectorizeRasterLine(fourRaster(gap));

      expect(result.graph.nodes.length).toBe(3);
      expect(result.graph.edges.length).toBe(3);
      expect(result.strokes.length).toBe(1);
      expect(retrace(result)).toBe(0);
      expect(completedEdges(result)).toBe(0);
      expect(result.coverage.mask >= 0.99).toBe(true);
      expect(result.coverage.precision >= 0.99).toBe(true);
    });
  }

  it('marks the fused loop as folded and keeps open loops traced', () => {
    const folded = (gap) =>
      vectorizeRasterLine(fourRaster(gap)).graph.edges.filter((e) => e.folded);

    expect(folded(60).length).toBe(0);
    expect(folded(10).length).toBe(1);
  });

  it('draws a loop of zero width as nearly a line: up and back down', () => {
    const result = vectorizeRasterLine(fourRaster(0));

    expect(result.graph.nodes.length).toBe(4);
    expect(result.graph.edges.length).toBe(3);
    expect(result.strokes.length).toBe(1);
    expect(completedEdges(result)).toBe(0);
    expect(result.coverage.mask >= 0.99).toBe(true);
  });
});

describe('wider ink is not a fishbone of stubs (issue 7)', () => {
  for (const radius of [8, 10, 12, 14, 18]) {
    it(`keeps a line pressed to radius ${radius} in the middle one link`, () => {
      const result = vectorizeRasterLine(pressureLine(radius));

      expect(result.graph.nodes.length).toBe(2);
      expect(result.graph.edges.length).toBe(1);
      expect(completedEdges(result)).toBe(0);
      expect(retrace(result)).toBe(0);
    });
  }
});
