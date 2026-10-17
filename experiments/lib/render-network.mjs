// Renders a vectorization result as an RGB PNG for debugging: ink mask in
// light gray, skeleton in blue, network links in red and nodes in green. With
// `strokes: true` the planned pen strokes are drawn instead, one colour per
// stroke, with a dot where each stroke starts.
import { encodePng } from '../../tests/helpers/images.js';

const STROKE_COLORS = [
  [210, 40, 40],
  [30, 120, 220],
  [230, 140, 20],
  [140, 60, 200],
  [20, 160, 140],
];

function drawLine(paint, a, b, color) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2) + 1;

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    paint(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, color);
  }
}

function drawPolyline(paint, points, color) {
  points.forEach((point, index) => {
    if (index > 0) {
      drawLine(paint, points[index - 1], point, color);
    }
  });
}

function drawDot(paint, point, color, radius) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      paint(point.x + dx, point.y + dy, color);
    }
  }
}

export function renderNetwork(result, { scale = 2, strokes = false } = {}) {
  const { width, height } = result;
  const fullWidth = width * scale;
  const fullHeight = height * scale;
  const image = new Uint8Array(fullWidth * fullHeight * 3).fill(255);
  // Paint in output pixels; `point` is in source pixel coordinates.
  const paint = (x, y, color) => {
    const px = Math.floor(x);
    const py = Math.floor(y);

    if (px >= 0 && py >= 0 && px < fullWidth && py < fullHeight) {
      image.set(color, (py * fullWidth + px) * 3);
    }
  };
  const scaled = (point) => ({ x: point.x * scale, y: point.y * scale });

  for (let y = 0; y < fullHeight; y += 1) {
    for (let x = 0; x < fullWidth; x += 1) {
      const index = Math.floor(y / scale) * width + Math.floor(x / scale);

      if (result.skeleton[index]) {
        image.set([170, 195, 235], (y * fullWidth + x) * 3);
      } else if (result.mask[index]) {
        image.set([215, 215, 215], (y * fullWidth + x) * 3);
      }
    }
  }

  const dot = Math.max(1, Math.round(scale / 2));

  if (strokes) {
    result.strokes.forEach((stroke, index) => {
      const color = STROKE_COLORS[index % STROKE_COLORS.length];
      drawPolyline(paint, stroke.points.map(scaled), color);
      drawDot(paint, scaled(stroke.points[0]), color, dot + 1);
    });
  } else {
    // Results from before issue 7 call the stroke network a graph.
    const network = result.network ?? {
      points: result.graph.nodes,
      links: result.graph.edges,
    };
    network.links.forEach((link) =>
      drawPolyline(paint, link.points.map(scaled), [210, 40, 40])
    );
    network.points.forEach((node) =>
      drawDot(paint, scaled(node), [20, 150, 60], dot)
    );
  }

  const rows = Array.from({ length: fullHeight }, (_, y) => [
    ...image.subarray(y * fullWidth * 3, (y + 1) * fullWidth * 3),
  ]);

  return encodePng({
    width: fullWidth,
    height: fullHeight,
    colorType: 2,
    bitDepth: 8,
    rows,
  });
}
