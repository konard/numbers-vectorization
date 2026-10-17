/**
 * A tiny in-memory associative links store in the spirit of the doublets
 * model from the associative technology stack
 * (https://github.com/link-assistant/formal-ai/blob/main/docs/associative-tech-stack.md).
 *
 * Everything is a link `(id: source target)`:
 *
 * - a *point* is a self-referencing link `(id: id id)` and represents a place
 *   where the pen starts, stops or meets itself (an end, a junction, or a
 *   loop anchor);
 * - a *link* between points is a doublet `(id: source target)` whose source
 *   and target reference those points; it represents one skeleton branch. A
 *   loop is simply `(id: point point)`.
 *
 * Together they form the stroke network: a links network, not a graph. Links
 * reference other links (a point references itself), so a step of a pen
 * stroke can in turn be a link referencing the link it walks. Payload
 * (coordinates, pixel chains) is kept in a side table keyed by link id, so the
 * link structure itself stays pure doublets that can be queried by source and
 * target. Rewriting the network (spur pruning, junction contraction, merging
 * pass-through points) is expressed as plain `update` and `delete` operations
 * on links.
 */
export class LinksStore {
  constructor() {
    this.records = new Map();
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
    this.records.set(id, { id, source, target });
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
    this.records.set(id, { id, source: id, target: id });
    this.index(id, id, id);

    if (data !== undefined) {
      this.data.set(id, data);
    }

    return id;
  }

  get(id) {
    return this.records.get(id);
  }

  has(id) {
    return this.records.has(id);
  }

  getData(id) {
    return this.data.get(id);
  }

  setData(id, data) {
    this.data.set(id, data);
  }

  isPoint(id) {
    const link = this.records.get(id);
    return Boolean(link) && link.source === id && link.target === id;
  }

  update(id, source, target) {
    const link = this.records.get(id);

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
    const link = this.records.get(id);

    if (!link) {
      return false;
    }

    this.unindex(id, link.source, link.target);
    this.records.delete(id);
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
        ids = ids.filter((id) => this.records.get(id).target === target);
      }
    } else if (target !== undefined) {
      ids = [...(this.byTarget.get(target) ?? [])];
    } else {
      ids = [...this.records.keys()];
    }

    return ids.sort((a, b) => a - b);
  }

  /** All point ids (self-referencing links). */
  points() {
    return this.search().filter((id) => this.isPoint(id));
  }

  /** All ids of links between points (not points themselves). */
  links() {
    return this.search().filter((id) => !this.isPoint(id));
  }

  /** @deprecated Use `links()`: the stroke network is not a graph. */
  edges() {
    return this.links();
  }

  /**
   * Ids of the links referencing a point. A loop is returned once.
   * @param {number} point - Point id.
   * @returns {number[]} Incident link ids.
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
   * How many link ends reference a point; loops count twice.
   * @param {number} point - Point id.
   * @returns {number} Degree.
   */
  degree(point) {
    return this.incident(point).reduce((sum, id) => {
      const link = this.records.get(id);
      return sum + (link.source === link.target ? 2 : 1);
    }, 0);
  }

  /** The opposite end of link `id` as seen from `point`. */
  other(id, point) {
    const link = this.records.get(id);
    return link.source === point ? link.target : link.source;
  }

  get size() {
    return this.records.size;
  }
}
