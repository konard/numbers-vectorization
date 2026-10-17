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
  /**
   * Simplification tolerance in pixels, or `auto` (default) to choose it per
   * shape: the fewest points that still explain the shape's ink.
   */
  simplifyTolerance?: number | 'auto';
  /**
   * Pen-width squares of ink one point must explain to be worth adding when
   * the tolerance is `auto` (default 1): larger values give fewer points.
   */
  pointCost?: number;
  /**
   * Most points per separate shape. Small budgets keep the longest strokes
   * and their sharpest corners; `1` leaves one dot per shape.
   */
  maxPoints?: number;
  strokeWidth?: number;
  /** Largest enclosed background hole (in pixels) filled before thinning. */
  fillHoles?: number;
  /** `smooth` emits cubic Bezier curves that keep sharp corners. */
  curve?: 'linear' | 'smooth';
  /** Tangent look-ahead (pixels) used to continue strokes at junctions. */
  lookAhead?: number;
  /**
   * Lift the pen where lines cross or meet straight (the two strokes of a
   * "+", "x" or "T", the bar of a "7") instead of retracing an arm with a
   * U-turn (default `true`).
   */
  penLifts?: boolean;
  /**
   * Pen widths of retracing one pen lift must save to be used (default 2.5),
   * so short dead ends and jitter at thick junctions stay one stroke.
   */
  penLiftCost?: number;
  /** Receives the stroke network after each pipeline stage (debugging). */
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
  /** Id of the network link the pen walks. */
  link: number;
  /** @deprecated Use `link`. */
  readonly edge: number;
  from: number;
  to: number;
  reversed: boolean;
  /** True when the pen walks over an already drawn link (a U-turn). */
  retrace: boolean;
}

export interface Stroke {
  start: number;
  points: VectorPoint[];
  steps: StrokeStep[];
  length: number;
  retraceLength: number;
}

export interface NetworkPoint {
  id: number;
  x: number;
  y: number;
  degree: number;
  pixels: number[];
}

export interface NetworkLink {
  id: number;
  /** Point the link starts at. */
  source: number;
  /** Point the link ends at (the same point for a loop). */
  target: number;
  length: number;
  points: VectorPoint[];
  pixels: number[];
  /** Added by coverage completion rather than traced from the skeleton. */
  completed: boolean;
  /**
   * A narrow loop explaining ink wider than one pen line: the pen went out
   * on one side and came back on the other (issue #7).
   */
  folded: boolean;
}

/**
 * The stroke network: points (ends, junctions, loop anchors) and the links
 * between them (skeleton branches). It is a links network, not a graph:
 * points are self-referencing links and links reference points.
 */
export interface StrokeNetwork {
  points: NetworkPoint[];
  links: NetworkLink[];
}

/** @deprecated The stroke network was called a graph before issue 7. */
export interface StrokeGraph {
  nodes: NetworkPoint[];
  edges: NetworkLink[];
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

export interface Thresholding {
  foreground: 'dark' | 'light';
  threshold: number;
  auto: boolean;
}

export interface ShapeSimplification {
  /** Indices into `strokes` before a point budget dropped any. */
  strokes: number[];
  /** Tolerance (pixels) chosen for the shape; 0 for a dot. */
  tolerance: number;
  points: number;
  /** Intersection over union of the drawn pen and the shape's ink (0..1). */
  match: number;
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
  network: StrokeNetwork;
  /** @deprecated Use `network`. */
  readonly graph: StrokeGraph;
  coverage: Coverage & {
    /** How many network links the strokes walk. */
    links: { total: number; traversed: number };
    /** @deprecated Use `links`. */
    readonly edges: { total: number; traversed: number };
  };
  /** Ink polarity and threshold used, `auto` when Otsu chose it. */
  thresholding: Thresholding;
  /** Simplification per separate shape (connected component). */
  simplification: {
    tolerance: number | 'auto';
    shapes: ShapeSimplification[];
  };
  /** The stroke network as doublet links. */
  links: LinksStore;
  svg: string;
  /** The stroke network and strokes as indented Links Notation. */
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
  /** Ids of links between points (not points themselves). */
  links(): number[];
  /** @deprecated Use `links()`. */
  edges(): number[];
  incident(point: number): number[];
  degree(point: number): number;
  other(link: number, point: number): number;
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

/** The ink polarity and threshold `rasterToMask` uses for these options. */
export declare function resolveThreshold(
  raster: RasterInput,
  options?: VectorizationOptions
): Thresholding;

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
 * Plans one pen stroke per connected component of a stroke network that walks
 * every link, retracing as little as possible (Chinese postman + Fleury).
 */
export declare function planStrokes(
  store: LinksStore,
  options?: { lookAhead?: number; reach?: number; liftCost?: number }
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

export interface PenSample {
  /** Canvas pixels. */
  x: number;
  y: number;
  /** Milliseconds since the recording started. */
  t: number;
  /** 0..1 (0.5 for devices without pressure). */
  pressure: number;
}

export interface PenBrush {
  /** Pen width at zero pressure (pixels). */
  width: number;
  /** Extra width at full pressure (pixels). */
  pressureWidth: number;
}

/** Pen movement drawn on a canvas, for replay and error reports (issue 7). */
export interface PenRecording {
  type: 'pen-recording';
  version: 1;
  width: number;
  height: number;
  brush: PenBrush;
  strokes: { pointer: string; samples: PenSample[] }[];
  /** Vectorization options in use when the recording was saved. */
  options?: VectorizationOptions;
}

export declare const PEN_RECORDING_TYPE: 'pen-recording';
export declare const DEFAULT_BRUSH: Readonly<PenBrush>;
export declare function createPenRecording(canvas: {
  width: number;
  height: number;
  brush?: PenBrush;
}): PenRecording;
export declare function beginPenStroke(
  recording: PenRecording,
  point: { x: number; y: number; t: number; pressure?: number },
  pointer?: string
): void;
export declare function extendPenStroke(
  recording: PenRecording,
  point: { x: number; y: number; t: number; pressure?: number }
): void;
export declare function penRecordingDuration(recording: PenRecording): number;
export declare function penRecordingSegments(
  recording: PenRecording
): { from: PenSample; to: PenSample; t: number; width: number }[];
/** Draws the recording as dark ink on a transparent RGBA raster. */
export declare function rasterizePenRecording(
  recording: PenRecording,
  options?: { until?: number }
): { width: number; height: number; pixels: Uint8ClampedArray };
/** The recording as indented Links Notation (`x y t pressure` samples). */
export declare function penRecordingToLinksNotation(
  recording: PenRecording
): string;
export declare function isPenRecordingText(text: string): boolean;
/** Reads a recording saved as JSON or Links Notation. */
export declare function parsePenRecording(text: string): PenRecording;
