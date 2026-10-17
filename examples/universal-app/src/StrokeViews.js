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

function nodeClass(degree) {
  if (degree === 1) {
    return 'graph-node graph-node-end';
  }

  return degree >= 3 ? 'graph-node graph-node-junction' : 'graph-node';
}

function edgeClass(edge, retraced) {
  if (edge.completed) {
    return 'graph-edge graph-edge-completed';
  }

  return retraced.has(edge.id)
    ? 'graph-edge graph-edge-retraced'
    : 'graph-edge';
}

function GraphLegend() {
  return h(
    'ul',
    { className: 'graph-legend' },
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
 * The stroke graph stored as doublet links: branches (edges) between
 * endpoints and junctions (nodes). Dashed edges are walked twice (a U-turn or
 * a detour), green edges were added by coverage completion.
 */
export function StrokeGraphView({ result }) {
  const unit = markerUnit(result);
  const retraced = new Set(
    result.strokes.flatMap((stroke) =>
      stroke.steps.filter((step) => step.retrace).map((step) => step.edge)
    )
  );
  const nodes = new Map(result.graph.nodes.map((node) => [node.id, node]));

  return h(
    'div',
    { className: 'graph-view' },
    h(
      SvgFrame,
      { result, label: 'Stroke graph' },
      h(
        'g',
        { fill: 'none', strokeWidth: unit * 0.45 },
        result.graph.edges.map((edge) =>
          h('path', {
            key: edge.id,
            d: strokesToSvgPath([edge.points]),
            className: edgeClass(edge, retraced),
            strokeDasharray: retraced.has(edge.id)
              ? `${unit * 1.4} ${unit}`
              : undefined,
          })
        )
      ),
      h(
        'g',
        null,
        result.graph.nodes.map((node) =>
          h('circle', {
            key: node.id,
            cx: node.x,
            cy: node.y,
            r: unit * 0.7,
            className: nodeClass(node.degree),
          })
        )
      ),
      h(
        'g',
        { className: 'graph-starts', strokeWidth: unit * 0.3 },
        result.strokes.map((stroke, index) => {
          const start = nodes.get(stroke.start) ?? stroke.points[0];

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
    h(GraphLegend)
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
