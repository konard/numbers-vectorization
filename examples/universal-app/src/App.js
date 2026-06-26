import {
  createElement as h,
  useCallback,
  useEffect,
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

const DRAWING_SIZE = 280;
const EMPTY_DRAWING_PIXELS = new Uint8ClampedArray(
  DRAWING_SIZE * DRAWING_SIZE * 4
);

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

function drawRaster(canvas, raster) {
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

function RasterCanvas({ raster, className, title }) {
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

function ModeTabs({ mode, onModeChange }) {
  return h(
    'div',
    { className: 'mode-tabs', role: 'tablist', 'aria-label': 'Input source' },
    ['mnist', 'draw'].map((value) =>
      h(
        'button',
        {
          key: value,
          type: 'button',
          className: value === mode ? 'mode-tab mode-tab-active' : 'mode-tab',
          role: 'tab',
          'aria-selected': value === mode,
          onClick: () => onModeChange(value),
        },
        value === 'mnist' ? 'MNIST' : 'Draw'
      )
    )
  );
}

function RangeControl({ id, label, min, max, step, value, onChange, suffix }) {
  return h(
    'label',
    { className: 'range-control', htmlFor: id },
    h(
      'span',
      null,
      h('span', null, label),
      h('strong', null, `${value}${suffix ?? ''}`)
    ),
    h('input', {
      id,
      type: 'range',
      min,
      max,
      step,
      value,
      onChange: (event) => onChange(Number(event.target.value)),
    })
  );
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

function DrawingCanvas({ raster, onRasterChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const pointRef = useRef(null);

  const captureRaster = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, DRAWING_SIZE, DRAWING_SIZE);
    onRasterChange({
      width: DRAWING_SIZE,
      height: DRAWING_SIZE,
      pixels: new Uint8ClampedArray(image.data),
    });
  }, [onRasterChange]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, DRAWING_SIZE, DRAWING_SIZE);
    onRasterChange({
      width: DRAWING_SIZE,
      height: DRAWING_SIZE,
      pixels: new Uint8ClampedArray(EMPTY_DRAWING_PIXELS),
    });
  }, [onRasterChange]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas) {
      drawRaster(canvas, raster);
    }
  }, [raster]);

  const getPoint = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = DRAWING_SIZE / rect.width;
    const scaleY = DRAWING_SIZE / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      pressure: event.pressure > 0 ? event.pressure : 0.45,
    };
  }, []);

  const drawSegment = useCallback((from, to) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.strokeStyle = '#101820';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 9 + to.pressure * 18;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drawingRef.current = true;
      const point = getPoint(event);
      pointRef.current = point;
      drawSegment(point, point);
      captureRaster();
    },
    [captureRaster, drawSegment, getPoint]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!drawingRef.current || !pointRef.current) {
        return;
      }

      const point = getPoint(event);
      drawSegment(pointRef.current, point);
      pointRef.current = point;
    },
    [drawSegment, getPoint]
  );

  const finishDrawing = useCallback(
    (event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      drawingRef.current = false;
      pointRef.current = null;
      captureRaster();
    },
    [captureRaster]
  );

  return h(
    'section',
    { className: 'drawing-section', 'aria-labelledby': 'drawing-title' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', { id: 'drawing-title' }, 'Pencil input'),
      h(
        'button',
        { type: 'button', className: 'clear-button', onClick: clearCanvas },
        'Clear'
      )
    ),
    h('canvas', {
      ref: canvasRef,
      className: 'drawing-canvas',
      width: DRAWING_SIZE,
      height: DRAWING_SIZE,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrawing,
      onPointerCancel: finishDrawing,
    })
  );
}

function Metrics({ result, activeSample, mode }) {
  const sourceLabel =
    mode === 'mnist'
      ? `MNIST ${activeSample.index} / digit ${activeSample.label}`
      : 'Drawn raster';
  const metrics = [
    ['Source', sourceLabel],
    ['Foreground', foregroundCount(result.mask)],
    ['Skeleton', foregroundCount(result.skeleton)],
    ['Points', result.points.length],
    ['Stroke', result.strokeWidth.toFixed(2)],
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

export function App() {
  const samples = useMemo(decodeMnistSamples, []);
  const [mode, setMode] = useState('mnist');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [threshold, setThreshold] = useState(32);
  const [tolerance, setTolerance] = useState(0.85);
  const [drawingRaster, setDrawingRaster] = useState({
    width: DRAWING_SIZE,
    height: DRAWING_SIZE,
    pixels: new Uint8ClampedArray(EMPTY_DRAWING_PIXELS),
  });
  const activeSample = samples[selectedIndex];
  const activeRaster = mode === 'mnist' ? activeSample : drawingRaster;
  const result = useMemo(
    () =>
      vectorizeRasterLine(activeRaster, {
        alphaThreshold: 24,
        simplifyTolerance: tolerance,
        threshold,
      }),
    [activeRaster, threshold, tolerance]
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
        h('p', { className: 'eyebrow' }, 'CPU raster to SVG'),
        h('h1', null, 'Numbers Vectorization')
      ),
      h(ModeTabs, { mode, onModeChange: setMode })
    ),
    h(
      'div',
      { className: 'workspace' },
      h(
        'aside',
        { className: 'control-column' },
        mode === 'mnist'
          ? h(SampleGrid, {
              samples,
              selectedIndex,
              onSelect: setSelectedIndex,
            })
          : h(DrawingCanvas, {
              raster: drawingRaster,
              onRasterChange: setDrawingRaster,
            }),
        h(
          'section',
          {
            className: 'settings-section',
            'aria-labelledby': 'settings-title',
          },
          h(
            'div',
            { className: 'section-header' },
            h('h2', { id: 'settings-title' }, 'Settings')
          ),
          h(RangeControl, {
            id: 'threshold',
            label: 'Threshold',
            min: 1,
            max: 240,
            step: 1,
            value: threshold,
            onChange: setThreshold,
          }),
          h(RangeControl, {
            id: 'tolerance',
            label: 'Simplify',
            min: 0,
            max: 3,
            step: 0.05,
            value: tolerance,
            onChange: setTolerance,
          })
        )
      ),
      h(
        'section',
        { className: 'result-column', 'aria-labelledby': 'result-title' },
        h(
          'div',
          { className: 'result-header' },
          h('h2', { id: 'result-title' }, 'Vectorization'),
          h(Metrics, { result, activeSample, mode })
        ),
        h(
          'div',
          { className: 'analysis-grid' },
          h(
            AnalysisPanel,
            {
              title: 'Raster',
              meta: `${activeRaster.width} x ${activeRaster.height}`,
            },
            h(RasterCanvas, {
              raster: activeRaster,
              className: 'raster-preview',
              title: 'Input raster',
            })
          ),
          h(
            AnalysisPanel,
            {
              title: 'Skeleton',
              meta: `${foregroundCount(result.skeleton)} px`,
            },
            h(SkeletonView, { result })
          ),
          h(
            AnalysisPanel,
            {
              title: 'SVG',
              meta: `${result.points.length} pts`,
            },
            h(VectorView, { result })
          )
        )
      )
    )
  );
}
