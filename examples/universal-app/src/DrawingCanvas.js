import {
  createElement as h,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  beginPenStroke,
  createPenRecording,
  extendPenStroke,
  parsePenRecording,
  penRecordingSegments,
  penRecordingToLinksNotation,
} from '../../../src/index.js';
import { drawRaster } from './RasterCanvas.js';
import {
  fitRecording,
  recordingForExport,
  recordingSummary,
} from './recordingModel.js';

export const DRAWING_SIZE = 280;

/** Pause between the last recorded stroke and one added after a reload. */
const RESUME_GAP = 300;

export function emptyDrawingRaster() {
  return {
    width: DRAWING_SIZE,
    height: DRAWING_SIZE,
    pixels: new Uint8ClampedArray(DRAWING_SIZE * DRAWING_SIZE * 4),
  };
}

export function emptyRecording() {
  return createPenRecording({ width: DRAWING_SIZE, height: DRAWING_SIZE });
}

/** Draw one pen segment (see `penRecordingSegments`) like the pencil. */
function paintSegment(context, segment) {
  context.strokeStyle = '#101820';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = segment.width;
  context.beginPath();
  context.moveTo(segment.from.x, segment.from.y);
  context.lineTo(segment.to.x, segment.to.y);
  context.stroke();
}

function download(name, text, type) {
  const url = globalThis.URL.createObjectURL(
    new globalThis.Blob([text], { type })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  globalThis.URL.revokeObjectURL(url);
}

function RecordingPanel({ recording, options, replaying, onReplay, onLoad }) {
  const [open, setOpen] = useState(false);
  const summary = recordingSummary(recording);
  const empty = summary.strokes === 0;
  const exported = () => recordingForExport(recording, options);

  return h(
    'div',
    { className: 'recording-panel', 'aria-label': 'Pen recording' },
    h(
      'p',
      { className: 'settings-note' },
      `Recording: ${summary.strokes} strokes, ${summary.samples} samples, ` +
        `${(summary.duration / 1000).toFixed(1)} s`
    ),
    h(
      'div',
      { className: 'recording-actions' },
      h(
        'button',
        {
          type: 'button',
          className: 'clear-button',
          disabled: empty || replaying,
          onClick: onReplay,
        },
        replaying ? 'Replaying' : 'Replay'
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'clear-button',
          disabled: empty,
          onClick: () =>
            download(
              'pen-recording.lino',
              penRecordingToLinksNotation(exported()),
              'text/plain'
            ),
        },
        'Save LiNo'
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'clear-button',
          disabled: empty,
          onClick: () =>
            download(
              'pen-recording.json',
              `${JSON.stringify(exported(), null, 2)}\n`,
              'application/json'
            ),
        },
        'Save JSON'
      ),
      h(
        'label',
        { className: 'clear-button file-button' },
        'Load',
        h('input', {
          type: 'file',
          accept: '.lino,.json,.txt,text/plain,application/json',
          onChange: onLoad,
        })
      )
    ),
    h(
      'details',
      {
        className: 'recording-text',
        onToggle: (event) => setOpen(event.currentTarget.open),
      },
      h('summary', null, 'Recording as Links Notation (for error reports)'),
      open ? h('pre', null, penRecordingToLinksNotation(exported())) : null
    )
  );
}

/**
 * Animate a recording on the canvas in real time; the raster is captured
 * when the replay ends (or is cut short).
 */
function useReplay(canvasRef, recordingRef, replayRef, captureRaster) {
  const [replaying, setReplaying] = useState(false);

  const finishReplay = useCallback(() => {
    replayRef.current?.finish();
  }, []);

  // Leaving the Draw mode mid-replay still keeps the whole drawing.
  useEffect(() => finishReplay, [finishReplay]);

  const replay = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas || replayRef.current) {
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    const segments = penRecordingSegments(recordingRef.current);
    let next = 0;
    let frame = 0;
    let start = null;
    const drawUntil = (t) => {
      while (next < segments.length && segments[next].t <= t) {
        paintSegment(context, segments[next]);
        next += 1;
      }
    };
    const finish = () => {
      globalThis.cancelAnimationFrame(frame);
      drawUntil(Infinity);
      replayRef.current = null;
      setReplaying(false);
      captureRaster(canvas);
    };
    const step = (now) => {
      start ??= now;
      drawUntil(now - start);

      if (next < segments.length) {
        frame = globalThis.requestAnimationFrame(step);
      } else {
        finish();
      }
    };

    context.clearRect(0, 0, DRAWING_SIZE, DRAWING_SIZE);
    replayRef.current = { finish };
    setReplaying(true);
    frame = globalThis.requestAnimationFrame(step);
  }, [captureRaster, recordingRef]);

  return { replaying, replay, finishReplay };
}

/** Draw with the pointer and record every pen sample. */
function usePencil({
  canvasRef,
  recordingRef,
  startRef,
  replayRef,
  captureRaster,
  onRecordingChange,
}) {
  const pointRef = useRef(null);

  const getPoint = useCallback((event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = DRAWING_SIZE / rect.width;
    const scaleY = DRAWING_SIZE / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      t: event.timeStamp - startRef.current,
      pressure: event.pressure > 0 ? event.pressure : 0.45,
    };
  }, []);

  const penWidth = useCallback(
    (point) => {
      const { brush } = recordingRef.current;
      return brush.width + brush.pressureWidth * point.pressure;
    },
    [recordingRef]
  );

  const drawTo = useCallback(
    (point) => {
      const context = canvasRef.current.getContext('2d', {
        willReadFrequently: true,
      });
      const from = pointRef.current ?? point;
      paintSegment(context, { from, to: point, width: penWidth(point) });
      pointRef.current = point;
    },
    [penWidth]
  );

  const handlePointerDown = useCallback(
    (event) => {
      if (replayRef.current) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      const recording = recordingRef.current;

      if (startRef.current === null) {
        const { duration, strokes } = recordingSummary(recording);
        startRef.current =
          event.timeStamp - (strokes > 0 ? duration + RESUME_GAP : 0);
      }

      const point = getPoint(event);
      pointRef.current = null;
      beginPenStroke(recording, point, event.pointerType || 'mouse');
      drawTo(point);
      captureRaster();
    },
    [captureRaster, drawTo, getPoint, recordingRef]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!pointRef.current) {
        return;
      }

      // Pens and touch screens report more samples than animation frames.
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
      const samples = coalesced.length > 0 ? coalesced : [event.nativeEvent];

      samples.forEach((sample) => {
        const point = getPoint(sample);
        extendPenStroke(recordingRef.current, point);
        drawTo(point);
      });
    },
    [drawTo, getPoint, recordingRef]
  );

  const finishDrawing = useCallback(
    (event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (!pointRef.current) {
        return;
      }

      pointRef.current = null;
      captureRaster();
      onRecordingChange();
    },
    [captureRaster, onRecordingChange]
  );

  return { handlePointerDown, handlePointerMove, finishDrawing };
}

/**
 * Pencil input. Every stroke is also recorded as timed pen samples
 * `{ x, y, t, pressure }` (issue 7) that can be replayed, saved as Links
 * Notation or JSON with the current settings, and loaded again.
 */
export function DrawingCanvas({
  raster,
  onRasterChange,
  recordingRef,
  onRecordingChange,
  options,
  onLoadOptions,
}) {
  const canvasRef = useRef(null);
  const startRef = useRef(null);
  const replayRef = useRef(null);
  const [error, setError] = useState('');

  const captureRaster = useCallback(
    (canvas = canvasRef.current) => {
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
    },
    [onRasterChange]
  );

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas && !replayRef.current) {
      drawRaster(canvas, raster);
    }
  }, [raster]);

  const { replaying, replay, finishReplay } = useReplay(
    canvasRef,
    recordingRef,
    replayRef,
    captureRaster
  );

  const reset = useCallback(
    (recording) => {
      finishReplay();
      recordingRef.current = recording;
      startRef.current = null;
      setError('');
      onRecordingChange();
    },
    [finishReplay, onRecordingChange, recordingRef]
  );

  const clearCanvas = useCallback(() => {
    reset(emptyRecording());
    canvasRef.current
      ?.getContext('2d', { willReadFrequently: true })
      .clearRect(0, 0, DRAWING_SIZE, DRAWING_SIZE);
    onRasterChange(emptyDrawingRaster());
  }, [onRasterChange, reset]);

  const loadRecording = useCallback(
    async (event) => {
      const [file] = event.target.files ?? [];
      event.target.value = '';

      if (!file) {
        return;
      }

      try {
        const recording = fitRecording(
          parsePenRecording(await file.text()),
          DRAWING_SIZE
        );
        reset(recording);
        onLoadOptions(recording.options ?? {});
        globalThis.requestAnimationFrame(replay);
      } catch (loadError) {
        setError(`Could not load ${file.name}: ${loadError.message}`);
      }
    },
    [onLoadOptions, replay, reset]
  );

  const pencil = usePencil({
    canvasRef,
    recordingRef,
    startRef,
    replayRef,
    captureRaster,
    onRecordingChange,
  });

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
      onPointerDown: pencil.handlePointerDown,
      onPointerMove: pencil.handlePointerMove,
      onPointerUp: pencil.finishDrawing,
      onPointerCancel: pencil.finishDrawing,
    }),
    h(RecordingPanel, {
      recording: recordingRef.current,
      options,
      replaying,
      onReplay: replay,
      onLoad: loadRecording,
    }),
    error ? h('p', { className: 'settings-note settings-error' }, error) : null
  );
}
