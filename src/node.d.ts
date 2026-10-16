import type {
  RasterInput,
  VectorizationOptions,
  VectorizationResult,
} from './index.js';

export interface DecodedRaster {
  width: number;
  height: number;
  pixels: Uint8ClampedArray | Uint8Array | number[];
}

export type OutputFormat = 'json' | 'svg' | 'path' | 'lino';

/** Decodes a non-interlaced PNG into RGBA pixels. */
export declare function decodePng(bytes: Uint8Array): DecodedRaster;

/** Decodes Netpbm P1-P6 (PBM, PGM, PPM) into RGBA pixels. */
export declare function decodePnm(bytes: Uint8Array): DecodedRaster;

/** Parses ASCII art: `.`, `_`, `-`, `0` and spaces are paper, others ink. */
export declare function parseAsciiRaster(text: string): DecodedRaster;

/** Detects PNG, Netpbm, JSON or ASCII input and decodes it. */
export declare function decodeImage(bytes: Uint8Array): {
  raster: RasterInput;
  format: 'png' | 'pnm' | 'json' | 'ascii';
};

/** Plain JSON view of a vectorization result. */
export declare function resultToJson(
  result: VectorizationResult
): Record<string, unknown>;

/** Builds vectorization options from kebab-case string parameters. */
export declare function optionsFromParams(
  read: (name: string) => string | null | undefined,
  defaults?: VectorizationOptions
): VectorizationOptions;

/** Serializes a vectorization result for the CLI or HTTP API. */
export declare function formatResult(
  result: VectorizationResult,
  format?: OutputFormat
): { body: string; contentType: string };
