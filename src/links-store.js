/**
 * A tiny in-memory associative links store in the spirit of the doublets
 * model from the associative technology stack
 * (https://github.com/link-assistant/formal-ai/blob/main/docs/associative-tech-stack.md).
 *
 * Everything is a link `(id: source target)`:
 *
 * - a *point* is a self-referencing link `(id: id id)` and represents a stroke
 *   graph node (an endpoint, a junction, or a loop anchor);
 * - an *edge* is a doublet `(id: source target)` between two points and
 *   represents one skeleton branch. A loop is simply `(id: point point)`.
 *
 * Payload (coordinates, pixel chains) is kept in a side table keyed by link
 * id, so the link structure itself stays a pure doublet graph that can be
 * queried by source and target. Graph rewriting (spur pruning, junction
 * contraction, degree-2 merging) is expressed as plain `update` and `delete`
 * operations on links.
 */
export class LinksStore {
  constructor() {
    this.links = new Map();
    this.data = new Map();
    this.bySource = new Map();
    this.byTarget = new Map();
    this.nextId = 1;
  }

  index(id, source, target) {
    if (!this.bySource.has(source)) {
      this.bySource.set(source, new Set());
    }

    if (!this.byTarget.has(target)) {
      this.byTarget.set(target, new Set());
    }

    this.bySource.get(source).add(id);
    this.byTarget.get(target).add(id);
  }

  unindex(id, source, target) {
    this.bySource.get(source)?.delete(id);
    this.byTarget.get(target)?.delete(id);
  }

  /**
   * Create a doublet link `(id: source target)`.
   * @returns {number} The new link id.
   */
  create(source, target, data) {
    const id = this.nextId;
    this.nextId += 1;
    this.links.set(id, { id, source, target });
    this.index(id, source, target);

    if (data !== undefined) {
      this.data.set(id, data);
    }

    return id;
  }

  /**
   * Create a self-referencing point link `(id: id id)`.
   * @returns {number} The new point id.
   */
  createPoint(data) {
    const id = this.nextId;
    this.nextId += 1;
    this.links.set(id, { id, source: id, target: id });
    this.index(id, id, id);

    if (data !== undefined) {
      this.data.set(id, data);
    }

    return id;
  }

  get(id) {
    return this.links.get(id);
  }

  has(id) {
    return this.links.has(id);
  }

  getData(id) {
    return this.data.get(id);
  }

  setData(id, data) {
    this.data.set(id, data);
  }

  isPoint(id) {
    const link = this.links.get(id);
    return Boolean(link) && link.source === id && link.target === id;
  }

  update(id, source, target) {
    const link = this.links.get(id);

    if (!link) {
      throw new RangeError(`Link ${id} does not exist.`);
    }

    this.unindex(id, link.source, link.target);
    link.source = source;
    link.target = target;
    this.index(id, source, target);

    return link;
  }

  delete(id) {
    const link = this.links.get(id);

    if (!link) {
      return false;
    }

    this.unindex(id, link.source, link.target);
    this.links.delete(id);
    this.data.delete(id);

    return true;
  }

  /**
   * Find link ids matching an optional source and/or target.
   * @param {{ source?: number, target?: number }} [query] - Search pattern.
   * @returns {number[]} Matching link ids in creation order.
   */
  search(query = {}) {
    const { source, target } = query;
    let ids;

    if (source !== undefined) {
      ids = [...(this.bySource.get(source) ?? [])];

      if (target !== undefined) {
        ids = ids.filter((id) => this.links.get(id).target === target);
      }
    } else if (target !== undefined) {
      ids = [...(this.byTarget.get(target) ?? [])];
    } else {
      ids = [...this.links.keys()];
    }

    return ids.sort((a, b) => a - b);
  }

  /** All point (node) ids. */
  points() {
    return this.search().filter((id) => this.isPoint(id));
  }

  /** All non-point (edge) ids. */
  edges() {
    return this.search().filter((id) => !this.isPoint(id));
  }

  /**
   * Edge ids touching a point. A loop edge is returned once.
   * @param {number} point - Point id.
   * @returns {number[]} Incident edge ids.
   */
  incident(point) {
    const ids = new Set([
      ...(this.bySource.get(point) ?? []),
      ...(this.byTarget.get(point) ?? []),
    ]);
    ids.delete(point);

    return [...ids].sort((a, b) => a - b);
  }

  /**
   * Graph degree of a point; loops count twice.
   * @param {number} point - Point id.
   * @returns {number} Degree.
   */
  degree(point) {
    return this.incident(point).reduce((sum, id) => {
      const link = this.links.get(id);
      return sum + (link.source === link.target ? 2 : 1);
    }, 0);
  }

  /** The opposite end of `edge` as seen from `point`. */
  other(edge, point) {
    const link = this.links.get(edge);
    return link.source === point ? link.target : link.source;
  }

  get size() {
    return this.links.size;
  }
}
