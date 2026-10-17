#!/usr/bin/env node

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { add, multiply, vectorizeRasterLine } from '../src/index.js';
import {
  decodeImage,
  defaultOptionsFor,
  formatResult,
  optionsFromParams,
} from '../src/node.js';
import { startServer } from '../src/server.js';

const COMMANDS = {
  add,
  multiply,
};

function usage() {
  return [
    'Usage: example-package-name <command> [arguments]',
    '',
    'Commands:',
    '  add <left> <right>       Add two numbers',
    '  multiply <left> <right>  Multiply two numbers',
    '  vectorize <file|->       Vectorize a PNG, PBM/PGM/PPM, JSON or ASCII raster',
    '  serve                    Start the HTTP API (GET /health, POST /vectorize)',
    '',
    'Vectorize options:',
    '  --format json|svg|path|lino  Output format (default: svg)',
    '  --output <file>              Write output to a file instead of stdout',
    '  --foreground dark|light|auto Ink polarity (default: auto)',
    '  --threshold <n>              Ink threshold (default: Otsu when auto)',
    '  --simplify auto|<n>          Tolerance in pixels, or tuned per shape (auto)',
    '  --point-cost <n>             Pen-width squares of ink a point must explain (1)',
    '  --max-points <n>             Most points per separate shape (1 = a dot)',
    '  --stroke-width <n>           SVG stroke width override',
    '  --fill-holes <n>             Fill enclosed holes up to n pixels',
    '  --curve linear|smooth        Polyline or smooth cubic Bézier output',
    '  --look-ahead <n>             Tangent look-ahead for path continuation',
    '  --pen-lifts true|false       Lift the pen where lines cross (default: true)',
    '  --pen-lift-cost <n>          Pen widths of retracing a lift saves (2.5)',
    '',
    'Serve options:',
    '  --port <n>  Port to listen on (default: 3000, env PORT)',
    '  --host <h>  Host to bind (default: 0.0.0.0, env HOST)',
    '',
    'Options:',
    '  --help     Show this help',
    '  --version  Show package version',
  ].join('\n');
}

function readVersion() {
  const packageUrl = new URL('../package.json', import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageUrl, 'utf8'));
  return packageJson.version;
}

function parseNumber(value, label) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number`);
  }

  return parsed;
}

function parseFlags(args) {
  const positional = [];
  const flags = new Map();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('--') || arg === '--') {
      positional.push(arg);
    } else if (arg.includes('=')) {
      const [name, ...value] = arg.slice(2).split('=');
      flags.set(name, value.join('='));
    } else {
      flags.set(arg.slice(2), args[index + 1]);
      index += 1;
    }
  }

  return { positional, flags };
}

function runVectorize(args, stdout) {
  const { positional, flags } = parseFlags(args);
  const [file] = positional;

  if (!file) {
    throw new Error('vectorize needs an input file (use - for stdin)');
  }

  const bytes = new Uint8Array(readFileSync(file === '-' ? 0 : file));
  const decoded = decodeImage(bytes);
  const options = optionsFromParams(
    (name) => flags.get(name),
    defaultOptionsFor(decoded)
  );
  const result = vectorizeRasterLine(decoded.raster, options);
  const output = formatResult(result, flags.get('format') ?? 'svg');

  if (flags.has('output')) {
    writeFileSync(flags.get('output'), `${output.body}\n`);
  } else {
    stdout(output.body);
  }

  return 0;
}

function runServe(args, stdout, stderr) {
  const { flags } = parseFlags(args);
  const port = parseNumber(
    flags.get('port') ?? process.env.PORT ?? 3000,
    'port'
  );
  const host = flags.get('host') ?? process.env.HOST ?? '0.0.0.0';

  startServer({ port, host }).then(
    (server) => {
      const address = server.address();
      stdout(`Vectorization API listening on http://${host}:${address.port}`);
    },
    (error) => {
      stderr(error.message);
      process.exitCode = 1;
    }
  );

  return 0;
}

export function runCli(
  argv,
  { stderr = console.error, stdout = console.log } = {}
) {
  const [command, left, right] = argv;

  if (!command || command === '--help' || command === '-h') {
    stdout(usage());
    return 0;
  }

  if (command === '--version' || command === '-v') {
    stdout(readVersion());
    return 0;
  }

  if (command === 'vectorize' || command === 'serve') {
    try {
      return command === 'vectorize'
        ? runVectorize(argv.slice(1), stdout)
        : runServe(argv.slice(1), stdout, stderr);
    } catch (error) {
      stderr(error.message);
      return 1;
    }
  }

  const operation = COMMANDS[command];

  if (!operation) {
    stderr(`Unknown command: ${command}`);
    stderr(usage());
    return 1;
  }

  try {
    const leftNumber = parseNumber(left, 'left');
    const rightNumber = parseNumber(right, 'right');
    stdout(String(operation(leftNumber, rightNumber)));
    return 0;
  } catch (error) {
    stderr(error.message);
    return 1;
  }
}

function isCliEntryPoint() {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isCliEntryPoint()) {
  process.exitCode = runCli(process.argv.slice(2));
}
