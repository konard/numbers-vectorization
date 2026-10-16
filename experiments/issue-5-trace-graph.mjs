// Dumps every stroke-graph rewriting stage for one bundled MNIST sample.
// Usage: node experiments/issue-5-trace-graph.mjs <sampleIndex>
import { vectorizeRasterLine } from '../src/index.js';
import { loadBundledMnistSamples } from './lib/mnist-samples.mjs';

const { raster } = loadBundledMnistSamples()[Number(process.argv[2] ?? 0)];
const describe = (store, id) => {
  const data = store.getData(id);
  if (store.isPoint(id)) {
    return `n${id} (${data.x.toFixed(1)},${data.y.toFixed(1)}) deg ${store.degree(id)} px ${data.pixels.length}`;
  }
  const { source, target } = store.get(id);
  return `e${id} n${source}->n${target} len ${data.length.toFixed(2)}`;
};
const result = vectorizeRasterLine(raster, {
  trace: (stage, store) => {
    console.log(`== ${stage}`);
    store.search().forEach((id) => console.log('  ', describe(store, id)));
  },
});
const rows = [];
for (let y = 0; y < raster.height; y += 1) {
  let line = '';
  for (let x = 0; x < raster.width; x += 1) {
    const index = y * raster.width + x;
    line += result.skeleton[index] ? '+' : result.mask[index] ? '#' : '.';
  }
  rows.push(line);
}
console.log(rows.join('\n'));
