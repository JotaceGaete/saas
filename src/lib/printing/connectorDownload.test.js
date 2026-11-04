// node --test src/lib/printing/connectorDownload.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECTOR_RELEASES, checksumCommand, connectorDownloadFor, isWalinkaPreviewOrigin,
} from './connectorDownload.js';

const PREVIEW = 'https://saas-git-claude-project-thread-x9ut7z-juan-s-projects-afd7e18e.vercel.app';

test('producción sigue descargando la versión estable', () => {
  for (const origin of ['https://go.walinka.com', 'https://go.ventalink.app', 'http://localhost:5173', null]) {
    assert.equal(connectorDownloadFor(origin), CONNECTOR_RELEASES.stable);
  }
  assert.equal(CONNECTOR_RELEASES.stable.version, '0.3.0');
  assert.equal(CONNECTOR_RELEASES.stable.url,
    'https://github.com/JotaceGaete/saas/releases/download/print-connector-v0.3.0/WalinkaPrintConnector-Setup-0.3.0.exe');
});

test('la Preview descarga 0.4.0 desde GitHub Releases', () => {
  const d = connectorDownloadFor(PREVIEW);
  assert.equal(d, CONNECTOR_RELEASES.preview);
  assert.equal(d.version, '0.4.0');
  assert.equal(d.url, 'https://github.com/JotaceGaete/saas/releases/download/print-connector-v0.4.0/WalinkaPrintConnector-Setup-0.4.0.exe');
  assert.equal(d.releaseUrl, 'https://github.com/JotaceGaete/saas/releases/tag/print-connector-v0.4.0');
});

test('cada versión tiene un SHA-256 de 64 hex en minúsculas', () => {
  for (const r of Object.values(CONNECTOR_RELEASES)) assert.match(r.sha256, /^[0-9a-f]{64}$/);
});

test('detección de Preview igual que el conector', () => {
  assert.equal(isWalinkaPreviewOrigin(PREVIEW), true);
  assert.equal(isWalinkaPreviewOrigin('https://saas-a1b2c3-juan-s-projects-afd7e18e.vercel.app'), true);
  assert.equal(isWalinkaPreviewOrigin('https://saas-x-otro-equipo.vercel.app'), false);
  assert.equal(isWalinkaPreviewOrigin('https://evil.saas-x-juan-s-projects-afd7e18e.vercel.app'), false);
  assert.equal(isWalinkaPreviewOrigin(`${PREVIEW}/`), false);
  assert.equal(isWalinkaPreviewOrigin(`https://saas-${'a'.repeat(40)}-juan-s-projects-afd7e18e.vercel.app`), false);
});

test('comando de verificación para Windows', () => {
  assert.equal(checksumCommand(CONNECTOR_RELEASES.preview), 'certutil -hashfile WalinkaPrintConnector-Setup-0.4.0.exe SHA256');
});
