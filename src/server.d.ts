import type { Server } from 'node:http';

/**
 * Creates the vectorization HTTP API (`GET /health`, `POST /vectorize`).
 */
export declare function createVectorizeServer(options?: {
  maxBodyBytes?: number;
}): Server;

/**
 * Creates the API server and starts listening.
 */
export declare function startServer(options?: {
  port?: number;
  host?: string;
  maxBodyBytes?: number;
}): Promise<Server>;
