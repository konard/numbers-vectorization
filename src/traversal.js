import { angleBetween, leavingDirection } from './geometry.js';

const MAX_EXACT_PAIRING_NODES = 16;
// Writers usually start a closed loop at its top and move counter-clockwise,
// i.e. down and to the left.
const START_DIRECTION = { x: -1, y: 1 };

function connectedComponents(store) {
  const parent = new Map(store.points().map((node) => [node, node]));
  const find = (node) => {
    let root = node;

    while (parent.get(root) !== root) {
      root = parent.get(root);
    }

    parent.set(node, root);
    return root;
  };

  for (const edge of store.edges()) {
    const { source, target } = store.get(edge);
    parent.set(find(source), find(target));
  }

  const groups = new Map();

  for (const node of store.points()) {
    const root = find(node);
    groups.set(root, [...(groups.get(root) ?? []), node]);
  }

  return [...groups.values()].map((nodes) => ({
    nodes,
    edges: [...new Set(nodes.flatMap((node) => store.incident(node)))].sort(
      (a, b) => a - b
    ),
  }));
}

/** Single-source shortest paths (Dijkstra) over the stroke graph. */
function shortestPaths(store, nodes, source) {
  const distance = new Map(nodes.map((node) => [node, Infinity]));
  const via = new Map();
  const done = new Set();
  distance.set(source, 0);

  for (let round = 0; round < nodes.length; round += 1) {
    let current;

    for (const node of nodes) {
      if (
        !done.has(node) &&
        (current === undefined || distance.get(node) < distance.get(current))
      ) {
        current = node;
      }
    }

    if (current === undefined || distance.get(current) === Infinity) {
      break;
    }

    done.add(current);

    for (const edge of store.incident(current)) {
      const next = store.other(edge, current);
      const candidate = distance.get(current) + store.getData(edge).length;

      if (next !== current && candidate < distance.get(next)) {
        distance.set(next, candidate);
        via.set(next, edge);
      }
    }
  }

  return { distance, via };
}

function pathEdges(store, search, source, target) {
  const edges = [];
  let current = target;

  while (current !== source) {
    const edge = search.via.get(current);
    edges.push(edge);
    current = store.other(edge, current);
  }

  return edges;
}

/**
 * Exact minimum-cost pairing of odd-degree nodes where exactly one pair is
 * left "free" (it becomes the start and the end of the open trail), solved
 * with a bitmask dynamic program.
 */
function exactPairing(costs) {
  const count = costs.length;
  const memo = [new Map(), new Map()];

  const solve = (mask, needFree) => {
    if (mask === 0) {
      return { cost: needFree ? Infinity : 0, pairs: [], free: null };
    }

    const cached = memo[needFree ? 1 : 0].get(mask);

    if (cached) {
      return cached;
    }

    const first = 31 - Math.clz32(mask & -mask);
    let best = { cost: Infinity, pairs: [], free: null };

    for (let second = first + 1; second < count; second += 1) {
      if ((mask & (1 << second)) === 0) {
        continue;
      }

      const rest = mask & ~(1 << first) & ~(1 << second);
      const paired = solve(rest, needFree);
      const pairedCost = costs[first][second] + paired.cost;

      if (pairedCost < best.cost) {
        best = {
          cost: pairedCost,
          pairs: [[first, second], ...paired.pairs],
          free: paired.free,
        };
      }

      if (needFree) {
        const freed = solve(rest, false);

        if (freed.cost < best.cost) {
          best = {
            cost: freed.cost,
            pairs: freed.pairs,
            free: [first, second],
          };
        }
      }
    }

    memo[needFree ? 1 : 0].set(mask, best);
    return best;
  };

  return solve((1 << count) - 1, true);
}

/** Greedy closest-pair matching for graphs with very many odd nodes. */
function greedyPairing(costs) {
  const candidates = [];

  for (let first = 0; first < costs.length; first += 1) {
    for (let second = first + 1; second < costs.length; second += 1) {
      candidates.push([costs[first][second], first, second]);
    }
  }

  candidates.sort((a, b) => a[0] - b[0]);
  const matched = new Set();
  const pairs = [];

  for (const [, first, second] of candidates) {
    if (matched.size >= costs.length - 2) {
      break;
    }

    if (!matched.has(first) && !matched.has(second)) {
      matched.add(first);
      matched.add(second);
      pairs.push([first, second]);
    }
  }

  const free = costs.map((_, index) => index).filter((i) => !matched.has(i));

  return { pairs, free };
}

function nodePosition(store, node) {
  const { x, y } = store.getData(node);
  return { x, y };
}

function topLeftScore(store, node) {
  const { x, y } = nodePosition(store, node);
  return x + y;
}

function pickTopLeft(store, nodes) {
  return [...nodes].sort(
    (a, b) => topLeftScore(store, a) - topLeftScore(store, b) || a - b
  )[0];
}

/**
 * Route inspection (Chinese postman) step: duplicate the cheapest set of
 * edges so that only two odd nodes remain, which makes an open Euler trail
 * possible. Duplicated edges are the strokes the pen has to retrace (U-turns).
 */
function planRetraces(store, component) {
  const odd = component.nodes.filter((node) => store.degree(node) % 2 === 1);

  if (odd.length === 0) {
    return { retraces: [], start: pickTopLeft(store, component.nodes) };
  }

  const searches = odd.map((node) =>
    shortestPaths(store, component.nodes, node)
  );
  const costs = odd.map((_, first) =>
    odd.map((target) => searches[first].distance.get(target))
  );
  const pairing =
    odd.length <= MAX_EXACT_PAIRING_NODES
      ? exactPairing(costs)
      : greedyPairing(costs);
  const retraces = pairing.pairs.flatMap(([first, second]) =>
    pathEdges(store, searches[first], odd[first], odd[second])
  );

  return {
    retraces,
    start: pickTopLeft(
      store,
      pairing.free.map((index) => odd[index])
    ),
  };
}

function createCopies(component, retraces) {
  return [...component.edges, ...retraces].map((edge, id) => ({
    id,
    edge,
    used: false,
  }));
}

function incidentCopies(store, copies, node) {
  return copies.filter((copy) => {
    const { source, target } = store.get(copy.edge);
    return !copy.used && (source === node || target === node);
  });
}

function canReach(store, copies, from, to) {
  if (from === to) {
    return true;
  }

  const seen = new Set([from]);
  const queue = [from];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const copy of incidentCopies(store, copies, queue[cursor])) {
      const next = store.other(copy.edge, queue[cursor]);

      if (next === to) {
        return true;
      }

      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

function isBridge(store, copies, copy, from) {
  const to = store.other(copy.edge, from);
  copy.used = true;
  const reachable = canReach(store, copies, from, to);
  copy.used = false;

  return !reachable;
}

function orientations(store, copy, from) {
  const { source, target } = store.get(copy.edge);

  if (source === target) {
    return [false, true];
  }

  return [source !== from];
}

function stepPoints(store, step) {
  const { points } = store.getData(step.edge);

  return step.reversed ? [...points].reverse() : points;
}

function candidateSteps(store, copies, current) {
  const available = incidentCopies(store, copies, current);
  const safe =
    available.length === 1
      ? available
      : available.filter((copy) => !isBridge(store, copies, copy, current));

  return (safe.length > 0 ? safe : available).flatMap((copy) =>
    orientations(store, copy, current).map((reversed) => ({
      copy,
      edge: copy.edge,
      from: current,
      to: store.other(copy.edge, current),
      reversed,
    }))
  );
}

function arrivalDirection(points, lookAhead) {
  const leaving = leavingDirection([...points].reverse(), lookAhead);
  return { x: -leaving.x, y: -leaving.y };
}

/**
 * Fleury's algorithm with a "good continuation" rule: never burn a bridge
 * while another edge is available, and among the safe edges continue with
 * the one that bends the least, which keeps crossings (4, 8) straight.
 */
function eulerTrail(store, copies, start, lookAhead) {
  const steps = [];
  const usage = new Map();
  let current = start;
  let heading = START_DIRECTION;

  for (;;) {
    const candidates = candidateSteps(store, copies, current);

    if (candidates.length === 0) {
      break;
    }

    let best;
    let bestAngle = Infinity;

    for (const candidate of candidates) {
      const points = stepPoints(store, candidate);
      const angle = angleBetween(heading, leavingDirection(points, lookAhead));

      if (angle < bestAngle) {
        best = { ...candidate, points };
        bestAngle = angle;
      }
    }

    best.copy.used = true;
    const count = usage.get(best.edge) ?? 0;
    usage.set(best.edge, count + 1);
    steps.push({
      edge: best.edge,
      from: best.from,
      to: best.to,
      reversed: best.reversed,
      retrace: count > 0,
    });
    heading = arrivalDirection(best.points, lookAhead);
    current = best.to;
  }

  return steps;
}

/**
 * Plan the pen strokes for a stroke graph: one continuous stroke per
 * connected component that traverses every edge at least once, retracing the
 * minimum possible length.
 *
 * @param {import('./links-store.js').LinksStore} store - Stroke graph.
 * @param {{ lookAhead?: number }} [options] - Tangent look-ahead in pixels.
 * @returns {{ start: number, steps: { edge: number, from: number, to: number,
 * reversed: boolean, retrace: boolean }[] }[]} Strokes in drawing order.
 */
export function planStrokes(store, options = {}) {
  const lookAhead = options.lookAhead ?? 3;
  const strokes = connectedComponents(store).map((component) => {
    const plan = planRetraces(store, component);
    const copies = createCopies(component, plan.retraces);

    return {
      start: plan.start,
      steps: eulerTrail(store, copies, plan.start, lookAhead),
    };
  });

  return strokes.sort(
    (a, b) => topLeftScore(store, a.start) - topLeftScore(store, b.start)
  );
}

/**
 * Concatenate the per-edge polylines of a planned stroke.
 *
 * @param {import('./links-store.js').LinksStore} store - Stroke graph.
 * @param {{ start: number, steps: object[] }} stroke - Planned stroke.
 * @param {string} [key] - Edge data key holding the polyline.
 * @returns {{ x: number, y: number }[]} Stroke points.
 */
export function strokePoints(store, stroke, key = 'points') {
  if (stroke.steps.length === 0) {
    return [nodePosition(store, stroke.start)];
  }

  const points = [];

  stroke.steps.forEach((step) => {
    const edgePoints = store.getData(step.edge)[key];
    const oriented = step.reversed ? [...edgePoints].reverse() : edgePoints;
    points.push(...(points.length === 0 ? oriented : oriented.slice(1)));
  });

  return points;
}
