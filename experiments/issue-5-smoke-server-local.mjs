// Runs the release smoke test's HTTP server check against a locally packed
// tarball, mirroring the SMOKE_TEST_SERVER_* settings in release.yml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { checkServerEntryPoint } from '../scripts/smoke-test-package.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'nv-smoke-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  const tarball = execFileSync(
    npm,
    ['pack', '--ignore-scripts', '--silent', '--pack-destination', workspace],
    { encoding: 'utf8' }
  ).trim();
  writeFileSync(join(workspace, 'package.json'), '{"private":true}');
  execFileSync(
    npm,
    ['install', '--ignore-scripts', resolve(workspace, tarball)],
    {
      cwd: workspace,
      stdio: 'inherit',
    }
  );
  await checkServerEntryPoint({
    serverArgs: ['serve', '--port', '38217', '--host', '127.0.0.1'],
    serverBin: 'example-package-name',
    serverHealthUrl: 'http://127.0.0.1:38217/health',
    workspace,
  });
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
