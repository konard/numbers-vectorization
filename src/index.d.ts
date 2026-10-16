export interface RasterInput {
  width: number;
  height: number;
  pixels?: ArrayLike<number>;
  data?: ArrayLike<number>;
}

export interface VectorizationOptions {
  threshold?: number;
  alphaThreshold?: number;
  /** `auto` detects the ink polarity and picks an Otsu threshold. */
  foreground?: 'dark' | 'light' | 'auto';
  simplifyTolerance?: number;
  strokeWidth?: number;
  /** Largest enclosed background hole (in pixels) filled before thinning. */
  fillHoles?: number;
  /** `smooth` emits cubic Bezier curves that keep sharp corners. */
  curve?: 'linear' | 'smooth';
  /** Tangent look-ahead (pixels) used to continue strokes at junctions. */
  lookAhead?: number;
  /** Receives the stroke graph after each pipeline stage (debugging). */
  trace?: (stage: string, store: LinksStore) => void;
}

export interface SvgDocumentOptions {
  title?: string;
  stroke?: string;
  className?: string;
}

export interface VectorPoint {
  x: number;
  y: number;
}

export interface StrokeStep {
  edge: number;
  from: number;
  to: number;
  reversed: boolean;
  /** True when the pen walks over an already drawn edge (a U-turn). */
  retrace: boolean;
}

export interface Stroke {
  start: number;
  points: VectorPoint[];
  steps: StrokeStep[];
  length: number;
  retraceLength: number;
}

export interface StrokeGraph {
  nodes: {
    id: number;
    x: number;
    y: number;
    degree: number;
    pixels: number[];
  }[];
  edges: {
    id: number;
    source: number;
    target: number;
    length: number;
    points: VectorPoint[];
    pixels: number[];
  }[];
}

export interface Coverage {
  /** Estimated pen width in pixels. */
  penWidth: number;
  /** Share of skeleton pixels reached by the strokes (0..1). */
  skeleton: number;
  /** Share of ink pixels inside the drawn pen footprint (0..1). */
  mask: number;
  /** Share of stroke samples that lie on ink (0..1). */
  precision: number;
  uncoveredSkeletonPixels: number[];
}

export interface VectorizationResult {
  width: number;
  height: number;
  mask: Uint8Array;
  skeleton: Uint8Array;
  points: VectorPoint[];
  /** One pen stroke per connected component, in drawing order. */
  strokes: Stroke[];
  path: string;
  strokeWidth: number;
  graph: StrokeGraph;
  coverage: Coverage & { edges: { total: number; traversed: number } };
  /** The stroke graph as doublet links. */
  links: LinksStore;
  svg: string;
  /** The stroke graph and strokes in Links Notation. */
  lino: string;
}

/**
 * In-memory doublet links store: every link is `(id: source target)`; a point
 * is a link whose source and target are itself.
 */
export declare class LinksStore {
  create(source: number, target: number, data?: unknown): number;
  createPoint(data?: unknown): number;
  get(id: number): { id: number; source: number; target: number } | undefined;
  has(id: number): boolean;
  getData(id: number): any;
  setData(id: number, data: unknown): void;
  isPoint(id: number): boolean;
  update(
    id: number,
    source: number,
    target: number
  ): { id: number; source: number; target: number };
  delete(id: number): boolean;
  /** Ids of links matching an optional source and/or target. */
  search(query?: { source?: number; target?: number }): number[];
  points(): number[];
  edges(): number[];
  incident(point: number): number[];
  degree(point: number): number;
  other(edge: number, point: number): number;
}

/**
 * Adds two numbers. Retained for compatibility with earlier template examples.
 */
export declare const add: (a: number, b: number) => number;

/**
 * Multiplies two numbers. Retained for compatibility with earlier template
 * examples.
 */
export declare const multiply: (a: number, b: number) => number;

/**
 * Delays execution for specified milliseconds.
 */
export declare const delay: (ms: number) => Promise<void>;

/**
 * Converts a grayscale, binary, or RGBA raster into a 0/1 foreground mask.
 */
export declare function rasterToMask(
  raster: RasterInput,
  options?: VectorizationOptions
): Uint8Array;

/**
 * Thins a binary mask to a one-pixel centerline using Zhang-Suen thinning.
 */
export declare function thinRasterMask(
  mask: Uint8Array,
  width: number,
  height: number
): Uint8Array;

/**
 * Simplifies a polyline using the Ramer-Douglas-Peucker algorithm.
 */
export declare function simplifyPolyline(
  points: VectorPoint[],
  tolerance?: number
): VectorPoint[];

/**
 * Reconstructs a single handwritten raster stroke as an SVG centerline path.
 */
export declare function vectorizeRasterLine(
  raster: RasterInput,
  options?: VectorizationOptions
): VectorizationResult;

/**
 * Alias for vectorizeRasterLine.
 */
export declare const rasterToSvgPath: typeof vectorizeRasterLine;

/**
 * Builds a standalone SVG document from vectorization output.
 */
export declare function createSvgDocument(
  result: VectorizationResult,
  options?: SvgDocumentOptions
): string;

/**
 * Alias for vectorizeRasterLine.
 */
export declare const vectorizeRaster: typeof vectorizeRasterLine;

/**
 * Plans one pen stroke per connected component of a stroke graph that walks
 * every edge, retracing as little as possible (Chinese postman + Fleury).
 */
export declare function planStrokes(
  store: LinksStore,
  options?: { lookAhead?: number }
): { start: number; steps: StrokeStep[] }[];

/**
 * Measures how well stroke polylines drawn with the pen width cover the ink.
 */
export declare function measureCoverage(
  input: {
    width: number;
    height: number;
    mask: Uint8Array;
    skeleton: Uint8Array;
    strokeWidth: number;
  },
  strokes: VectorPoint[][]
): Coverage;

/**
 * Serializes a vectorization result as Links Notation.
 */
export declare function toLinksNotation(result: VectorizationResult): string;

/**
 * Serializes stroke polylines as SVG path data, one subpath per stroke.
 */
export declare function strokesToSvgPath(
  strokes: VectorPoint[][],
  options?: { curve?: 'linear' | 'smooth' }
): string;

/**
 * Labels 4- or 8-connected components of pixels equal to `value`.
 */
export declare function labelComponents(
  mask: ArrayLike<number>,
  width: number,
  height: number,
  options?: { value?: number; connectivity?: 4 | 8 }
): {
  labels: Int32Array;
  components: { pixels: number[]; touchesBorder: boolean }[];
};

/**
 * Fills enclosed background holes of at most `maxArea` pixels.
 */
export declare function fillSmallHoles(
  mask: Uint8Array,
  width: number,
  height: number,
  maxArea: number
): Uint8Array;

/**
 * Neighbours of a skeleton pixel under m-adjacency.
 */
export declare function skeletonNeighbors(
  skeleton: Uint8Array,
  width: number,
  height: number,
  index: number
): number[];
