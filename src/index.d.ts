export interface RasterInput {
  width: number;
  height: number;
  pixels?: ArrayLike<number>;
  data?: ArrayLike<number>;
}

export interface VectorizationOptions {
  threshold?: number;
  alphaThreshold?: number;
  foreground?: 'dark' | 'light';
  simplifyTolerance?: number;
  strokeWidth?: number;
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

export interface VectorizationResult {
  width: number;
  height: number;
  mask: Uint8Array;
  skeleton: Uint8Array;
  points: VectorPoint[];
  path: string;
  strokeWidth: number;
  svg: string;
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
