import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('no arranca PostgREST ni tests cuando el puerto 3999 ya está ocupado', async () => {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(3999, '127.0.0.1', resolve);
    });
  } catch (err) {
    server.close();
    if (err.code === 'EADDRINUSE') return; // No interferir con un servicio local ajeno.
    throw err;
  }
  const dir = mkdtempSync(join(tmpdir(), 'fiscal-port-'));
  const marker = join(dir, 'started');
  const fake = join(dir, 'postgrest');
  writeFileSync(fake, '#!/bin/sh\ntouch "$FISCAL_PORT_MARKER"\nexit 88\n');
  chmodSync(fake, 0o755);
  try {
    const script = join(dirname(fileURLToPath(import.meta.url)), 'run.sh');
    const result = spawnSync('bash', [script], {
      env: {
        ...process.env,
        POSTGREST_BIN: fake,
        FISCAL_PORT_MARKER: marker,
        PGRST_DB_URI: 'postgres://postgres@127.0.0.1:5544/walinka_test',
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 4, result.stderr);
    assert.equal(existsSync(marker), false, 'no debe iniciarse otro PostgREST');
  } finally {
    server.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
