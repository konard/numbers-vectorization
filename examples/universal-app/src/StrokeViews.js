import { createElement as h, useState } from 'react';
import { strokesToSvgPath } from '../../../src/index.js';

const STROKE_COLORS = ['#255f85', '#b84d3e', '#2f8068', '#8a5a9e', '#b7791f'];

function strokeColor(index) {
  return STROKE_COLORS[index % STROKE_COLORS.length];
}

/** Marker size that reads well on 28 px MNIST digits and 280 px drawings. */
function markerUnit(result) {
  return Math.max(result.width, result.height) / 40;
}

function SvgFrame({ result, label, children }) {
  return h(
    'svg',
    {
      className: 'analysis-svg',
      viewBox: `0 0 ${result.width} ${result.height}`,
      role: 'img',
      'aria-label': label,
    },
    children
  );
}

function pointClass(degree) {
  if (degree === 1) {
    return 'network-point network-point-end';
  }

  return degree >= 3 ? 'network-point network-point-junction' : 'network-point';
}

function linkClass(link, retraced) {
  if (link.completed) {
    return 'network-link network-link-completed';
  }

  return retraced.has(link.id)
    ? 'network-link network-link-retraced'
    : 'network-link';
}

function NetworkLegend() {
  return h(
    'ul',
    { className: 'network-legend' },
    [
      ['legend-end', 'End'],
      ['legend-junction', 'Junction'],
      ['legend-start', 'Start'],
      ['legend-retraced', 'Retraced'],
      ['legend-completed', 'Completed'],
    ].map(([className, label]) =>
      h('li', { key: label }, h('span', { className }), label)
    )
  );
}

/**
 * The stroke network stored as doublet links: branches (links) between
 * ends and junctions (points). Dashed links are walked twice (a U-turn or a
 * detour), green links were added by coverage completion.
 */
export function StrokeNetworkView({ result }) {
  const unit = markerUnit(result);
  const retraced = new Set(
    result.strokes.flatMap((stroke) =>
      stroke.steps.filter((step) => step.retrace).map((step) => step.link)
    )
  );
  const points = new Map(
    result.network.points.map((point) => [point.id, point])
  );

  return h(
    'div',
    { className: 'network-view' },
    h(
      SvgFrame,
      { result, label: 'Stroke network' },
      h(
        'g',
        { fill: 'none', strokeWidth: unit * 0.45 },
        result.network.links.map((link) =>
          h('path', {
            key: link.id,
            d: strokesToSvgPath([link.points]),
            className: linkClass(link, retraced),
            strokeDasharray: retraced.has(link.id)
              ? `${unit * 1.4} ${unit}`
              : undefined,
          })
        )
      ),
      h(
        'g',
        null,
        result.network.points.map((point) =>
          h('circle', {
            key: point.id,
            cx: point.x,
            cy: point.y,
            r: unit * 0.7,
            className: pointClass(point.degree),
          })
        )
      ),
      h(
        'g',
        { className: 'network-starts', strokeWidth: unit * 0.3 },
        result.strokes.map((stroke, index) => {
          const start = points.get(stroke.start) ?? stroke.points[0];

          return start
            ? h('circle', {
                key: index,
                cx: start.x,
                cy: start.y,
                r: unit * 1.3,
                fill: 'none',
                stroke: strokeColor(index),
              })
            : null;
        })
      )
    ),
    h(NetworkLegend)
  );
}

function replaySchedule(result) {
  const speed = Math.max(result.width, result.height) * 1.2;
  let delay = 0;

  return result.strokes.map((stroke) => {
    const duration = Math.max(0.2, stroke.length / speed);
    const entry = { stroke, delay, duration };
    delay += duration + 0.15;
    return entry;
  });
}

/**
 * Animated stroke-order replay: each pen stroke is drawn in planning order,
 * starting at its numbered start point.
 */
export function StrokeReplay({ result, curve }) {
  const [run, setRun] = useState(0);
  const unit = markerUnit(result);
  const schedule = replaySchedule(result);

  return h(
    'div',
    { className: 'replay-view' },
    h(
      SvgFrame,
      { result, label: 'Stroke order replay' },
      h('path', {
        d: result.path,
        className: 'replay-ghost',
        fill: 'none',
        strokeWidth: result.strokeWidth,
      }),
      h(
        'g',
        { key: run, fill: 'none', strokeWidth: result.strokeWidth * 0.8 },
        schedule.map(({ stroke, delay, duration }, index) =>
          h('path', {
            key: index,
            d: strokesToSvgPath([stroke.points], { curve }),
            pathLength: 1,
            className: 'replay-path',
            stroke: strokeColor(index),
            style: {
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            },
          })
        )
      ),
      h(
        'g',
        { className: 'replay-starts', fontSize: unit * 2.6 },
        schedule.map(({ stroke }, index) =>
          stroke.points.length > 0
            ? h(
                'text',
                {
                  key: index,
                  x: stroke.points[0].x + unit,
                  y: stroke.points[0].y - unit,
                  fill: strokeColor(index),
                },
                String(index + 1)
              )
            : null
        )
      )
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'clear-button',
        onClick: () => setRun((value) => value + 1),
      },
      'Replay'
    )
  );
}

export function LinoView({ result }) {
  return h('pre', { className: 'lino-output' }, result.lino);
}
