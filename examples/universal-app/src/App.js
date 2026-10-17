import {
  createElement as h,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { vectorizeRasterLine } from '../../../src/index.js';
import {
  MNIST_SAMPLE_COUNT,
  MNIST_SAMPLE_HEIGHT,
  MNIST_SAMPLE_LABELS,
  MNIST_SAMPLE_PIXELS_BASE64,
  MNIST_SAMPLE_WIDTH,
} from './mnistSamples.js';
import { SegmentedControl } from './Controls.js';
import {
  DrawingCanvas,
  emptyDrawingRaster,
  emptyRecording,
} from './DrawingCanvas.js';
import { IMAGE_SIZE, ImageInput } from './ImageInput.js';
import { RasterCanvas } from './RasterCanvas.js';
import { SettingsPanel } from './SettingsPanel.js';
import {
  defaultSettings,
  settingsFromOptions,
  settingsToOptions,
} from './settingsModel.js';
import { LinoView, StrokeNetworkView, StrokeReplay } from './StrokeViews.js';

const EMPTY_IMAGE_RASTER = {
  width: IMAGE_SIZE,
  height: IMAGE_SIZE,
  pixels: new Uint8ClampedArray(IMAGE_SIZE * IMAGE_SIZE * 4),
};
const MODES = [
  ['mnist', 'MNIST'],
  ['draw', 'Draw'],
  ['image', 'Image'],
];

function decodeBase64Bytes(value) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeMnistSamples() {
  const bytes = decodeBase64Bytes(MNIST_SAMPLE_PIXELS_BASE64);
  const imageSize = MNIST_SAMPLE_WIDTH * MNIST_SAMPLE_HEIGHT;

  return Array.from({ length: MNIST_SAMPLE_COUNT }, (_, index) => {
    const start = index * imageSize;
    const end = start + imageSize;

    return {
      id: `mnist-${index}`,
      index,
      label: MNIST_SAMPLE_LABELS[index],
      width: MNIST_SAMPLE_WIDTH,
      height: MNIST_SAMPLE_HEIGHT,
      pixels: bytes.slice(start, end),
    };
  });
}

function foregroundCount(mask) {
  return mask.reduce((count, value) => count + value, 0);
}

function SampleButton({ sample, selected, onSelect }) {
  return h(
    'button',
    {
      type: 'button',
      className: selected
        ? 'sample-button sample-button-active'
        : 'sample-button',
      onClick: () => onSelect(sample.index),
      'aria-pressed': selected,
    },
    h(RasterCanvas, {
      raster: sample,
      className: 'sample-canvas',
      title: `MNIST ${sample.index}`,
    }),
    h('span', null, String(sample.label))
  );
}

function SampleGrid({ samples, selectedIndex, onSelect }) {
  return h(
    'section',
    { className: 'sample-section', 'aria-labelledby': 'samples-title' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', { id: 'samples-title' }, 'Samples')
    ),
    h(
      'div',
      { className: 'sample-grid' },
      samples.map((sample) =>
        h(SampleButton, {
          key: sample.id,
          sample,
          selected: sample.index === selectedIndex,
          onSelect,
        })
      )
    )
  );
}

function SkeletonView({ result }) {
  const pixels = [];

  for (let index = 0; index < result.skeleton.length; index += 1) {
    if (result.skeleton[index] === 1) {
      pixels.push(
        h('rect', {
          key: index,
          x: index % result.width,
          y: Math.floor(index / result.width),
          width: 1,
          height: 1,
        })
      );
    }
  }

  return h(
    'svg',
    {
      className: 'analysis-svg',
      viewBox: `0 0 ${result.width} ${result.height}`,
      role: 'img',
      'aria-label': 'Skeleton and centerline',
    },
    h('g', { className: 'skeleton-pixels' }, pixels),
    result.path
      ? h('path', {
          d: result.path,
          className: 'centerline-path',
          fill: 'none',
          strokeWidth: Math.max(result.strokeWidth * 0.35, 0.8),
        })
      : null
  );
}

function VectorView({ result }) {
  return h('div', {
    className: 'vector-output',
    dangerouslySetInnerHTML: { __html: result.svg },
  });
}

function AnalysisPanel({ title, meta, children }) {
  return h(
    'section',
    { className: 'analysis-panel', 'aria-label': title },
    h(
      'div',
      { className: 'analysis-panel-header' },
      h('h2', null, title),
      h('span', null, meta)
    ),
    h('div', { className: 'analysis-panel-body' }, children)
  );
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function sourceLabel(mode, activeSample, imageName) {
  if (mode === 'mnist') {
    return `MNIST ${activeSample.index} / digit ${activeSample.label}`;
  }

  return mode === 'draw' ? 'Drawn raster' : imageName || 'No image yet';
}

function Metrics({ result, source }) {
  const retrace = result.strokes.reduce(
    (sum, stroke) => sum + stroke.retraceLength,
    0
  );
  const metrics = [
    ['Source', source],
    ['Strokes', result.strokes.length],
    [
      'Network',
      `${result.network.points.length} p / ${result.network.links.length} l`,
    ],
    ['Retrace', `${retrace.toFixed(1)} px`],
    ['Ink covered', percent(result.coverage.mask)],
    ['Skeleton covered', percent(result.coverage.skeleton)],
    ['Points', result.points.length],
    ['Pen', `${result.strokeWidth.toFixed(2)} px`],
  ];

  return h(
    'dl',
    { className: 'metrics' },
    metrics.map(([label, value]) =>
      h(
        'div',
        { key: label },
        h('dt', null, label),
        h('dd', null, String(value))
      )
    )
  );
}

function ControlInput({
  mode,
  samples,
  selectedIndex,
  onSelect,
  drawing,
  image,
}) {
  if (mode === 'mnist') {
    return h(SampleGrid, { samples, selectedIndex, onSelect });
  }

  return mode === 'draw' ? h(DrawingCanvas, drawing) : h(ImageInput, image);
}

function ResultPanels({ result, activeRaster, curve }) {
  const panels = [
    [
      'Raster',
      `${activeRaster.width} x ${activeRaster.height}`,
      h(RasterCanvas, {
        raster: activeRaster,
        className: 'raster-preview',
        title: 'Input raster',
      }),
    ],
    [
      'Skeleton',
      `${foregroundCount(result.skeleton)} px`,
      h(SkeletonView, { result }),
    ],
    [
      'Stroke network',
      `${result.network.points.length} points, ${result.network.links.length} links`,
      h(StrokeNetworkView, { result }),
    ],
    [
      'Stroke order',
      `${result.strokes.length} strokes`,
      h(StrokeReplay, { result, curve }),
    ],
    ['SVG', `${result.points.length} pts`, h(VectorView, { result })],
    [
      'Links Notation',
      `${result.lino.split('\n').length - 1} lines`,
      h(LinoView, { result }),
    ],
  ];

  return h(
    'div',
    { className: 'analysis-grid' },
    panels.map(([title, meta, body]) =>
      h(AnalysisPanel, { key: title, title, meta }, body)
    )
  );
}

export function App() {
  const samples = useMemo(decodeMnistSamples, []);
  const [mode, setMode] = useState('mnist');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [settings, setSettings] = useState(defaultSettings);
  const [drawingRaster, setDrawingRaster] = useState(emptyDrawingRaster);
  const recordingRef = useRef(null);
  recordingRef.current ??= emptyRecording();
  const [, setRecordingVersion] = useState(0);
  const handleRecordingChange = useCallback(
    () => setRecordingVersion((version) => version + 1),
    []
  );
  const handleLoadOptions = useCallback(
    (options) => setSettings(settingsFromOptions(options)),
    []
  );
  const [image, setImage] = useState({ raster: EMPTY_IMAGE_RASTER, name: '' });
  const handleImageChange = useCallback(
    (raster, name) => setImage({ raster, name }),
    []
  );
  const activeSample = samples[selectedIndex];
  const activeRaster =
    { mnist: activeSample, draw: drawingRaster }[mode] ?? image.raster;
  const options = useMemo(() => settingsToOptions(settings), [settings]);
  const result = useMemo(
    () => vectorizeRasterLine(activeRaster, options),
    [activeRaster, options]
  );

  return h(
    'main',
    { className: 'app-shell' },
    h(
      'header',
      { className: 'app-header' },
      h(
        'div',
        null,
        h('p', { className: 'eyebrow' }, 'CPU raster to SVG pen strokes'),
        h('h1', null, 'Numbers Vectorization')
      ),
      h(SegmentedControl, {
        label: 'Input source',
        options: MODES,
        value: mode,
        onChange: setMode,
      })
    ),
    h(
      'div',
      { className: 'workspace' },
      h(
        'aside',
        { className: 'control-column' },
        h(ControlInput, {
          mode,
          samples,
          selectedIndex,
          onSelect: setSelectedIndex,
          drawing: {
            raster: drawingRaster,
            onRasterChange: setDrawingRaster,
            recordingRef,
            onRecordingChange: handleRecordingChange,
            options,
            onLoadOptions: handleLoadOptions,
          },
          image: { name: image.name, onImageChange: handleImageChange },
        }),
        h(SettingsPanel, {
          settings,
          onSettingsChange: setSettings,
          result,
        })
      ),
      h(
        'section',
        { className: 'result-column', 'aria-labelledby': 'result-title' },
        h(
          'div',
          { className: 'result-header' },
          h('h2', { id: 'result-title' }, 'Vectorization'),
          h(Metrics, {
            result,
            source: sourceLabel(mode, activeSample, image.name),
          })
        ),
        h(ResultPanels, { result, activeRaster, curve: settings.curve })
      )
    )
  );
}
