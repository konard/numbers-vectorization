// Renders a vectorization result as an RGB PNG for debugging: ink mask in
// light gray, skeleton in blue, network edges in red and nodes in green.
import { encodePng } from '../../tests/helpers/images.js';

function drawLine(paint, a, b, color) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2) + 1;

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    paint(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, color);
  }
}

export function renderNetwork(result, { scale = 2 } = {}) {
  const { width, height } = result;
  const image = new Uint8Array(width * height * 3).fill(255);
  const paint = (x, y, color) => {
    const px = Math.round(x - 0.5);
    const py = Math.round(y - 0.5);

    if (px >= 0 && py >= 0 && px < width && py < height) {
      image.set(color, (py * width + px) * 3);
    }
  };

  for (let index = 0; index < width * height; index += 1) {
    if (result.skeleton[index]) {
      image.set([90, 140, 220], index * 3);
    } else if (result.mask[index]) {
      image.set([215, 215, 215], index * 3);
    }
  }

  const network = result.network ?? result.graph;
  network.edges.forEach((edge) =>
    edge.points.forEach((point, index) => {
      if (index > 0) {
        drawLine(paint, edge.points[index - 1], point, [210, 40, 40]);
      }
    })
  );
  network.nodes.forEach((node) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        paint(node.x + dx, node.y + dy, [20, 150, 60]);
      }
    }
  });

  const rows = [];

  for (let y = 0; y < height * scale; y += 1) {
    const row = [];

    for (let x = 0; x < width * scale; x += 1) {
      const index = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 3;
      row.push(image[index], image[index + 1], image[index + 2]);
    }

    rows.push(row);
  }

  return encodePng({
    width: width * scale,
    height: height * scale,
    colorType: 2,
    bitDepth: 8,
    rows,
  });
}
