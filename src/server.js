import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { URL } from 'node:url';

import { vectorizeRasterLine } from './index.js';
import { isPenRecordingText } from './pen-recording.js';
import {
  decodeImage,
  defaultOptionsFor,
  formatResult,
  optionsFromParams,
} from './node.js';

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function packageInfo() {
  const packageUrl = new URL('../package.json', import.meta.url);
  const { name, version } = JSON.parse(readFileSync(packageUrl, 'utf8'));
  return { name, version };
}

function send(response, status, body, contentType = 'application/json') {
  response.writeHead(status, { ...CORS_HEADERS, 'content-type': contentType });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(request, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;

      if (size > maxBodyBytes) {
        reject(
          new HttpError(413, `Request body exceeds ${maxBodyBytes} bytes`)
        );
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function parseRequest(body, contentType, params) {
  if (body.length === 0) {
    throw new HttpError(400, 'Request body is empty');
  }

  const text = body.toString('utf8');

  if (contentType.includes('application/json') && !isPenRecordingText(text)) {
    const payload = JSON.parse(text);
    const raster = payload.raster ?? payload;
    return {
      raster,
      options: { ...optionsFromParams(params), ...payload.options },
    };
  }

  const decoded = decodeImage(new Uint8Array(body));
  return {
    raster: decoded.raster,
    // Uploaded images may be light or dark ink; a pen recording keeps the
    // options it was drawn with.
    options: optionsFromParams(
      params,
      decoded.format === 'pen-recording'
        ? defaultOptionsFor(decoded)
        : { foreground: 'auto' }
    ),
  };
}

async function handleVectorize(request, response, url, maxBodyBytes) {
  const body = await readBody(request, maxBodyBytes);
  const params = (name) => url.searchParams.get(name);
  let parsed;

  try {
    parsed = parseRequest(body, request.headers['content-type'] ?? '', params);
  } catch (error) {
    throw error instanceof HttpError
      ? error
      : new HttpError(400, error.message);
  }

  let output;

  try {
    const result = vectorizeRasterLine(parsed.raster, parsed.options);
    output = formatResult(result, url.searchParams.get('format') ?? 'json');
  } catch (error) {
    throw new HttpError(400, error.message);
  }

  send(response, 200, output.body, output.contentType);
}

function usage(info) {
  return {
    ...info,
    endpoints: {
      'GET /health': 'Liveness probe',
      'POST /vectorize':
        'Body: PNG, PBM/PGM/PPM, ASCII art, or JSON { width, height, pixels, options }. ' +
        'Query: format=json|svg|path|lino, threshold, foreground=dark|light|auto, ' +
        'simplify, stroke-width, fill-holes, curve=linear|smooth, look-ahead, ' +
        'pen-lifts=true|false, pen-lift-cost, simplify=auto|<n>, point-cost, ' +
        'max-points',
    },
  };
}

/**
 * Create the vectorization HTTP API server (not yet listening).
 *
 * @param {{ maxBodyBytes?: number }} [options] - Server options.
 * @returns {import('node:http').Server} HTTP server.
 */
export function createVectorizeServer(options = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const info = packageInfo();

  return createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const route = `${request.method} ${url.pathname}`;

    if (request.method === 'OPTIONS') {
      response.writeHead(204, CORS_HEADERS);
      response.end();
      return;
    }

    if (route === 'GET /health') {
      send(response, 200, { status: 'ok', ...info });
      return;
    }

    if (route === 'GET /') {
      send(response, 200, usage(info));
      return;
    }

    if (route !== 'POST /vectorize') {
      send(response, 404, { error: `Not found: ${route}` });
      return;
    }

    handleVectorize(request, response, url, maxBodyBytes).catch((error) => {
      send(response, error.status ?? 500, { error: error.message });
    });
  });
}

/**
 * Start the vectorization HTTP API server.
 *
 * @param {{ port?: number, host?: string, maxBodyBytes?: number }} [options]
 * Listen options. Port 0 picks a free port.
 * @returns {Promise<import('node:http').Server>} Listening server.
 */
export function startServer(options = {}) {
  const server = createVectorizeServer(options);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 3000, options.host ?? '0.0.0.0', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
