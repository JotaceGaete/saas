// Fase 2: respuestas tardías, doble clic, reintentos de red y consulta/reimpresión de boletas
// existentes, todo contra un DTE Core SIMULADO local (HTTP real en 127.0.0.1). Sin red externa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createSiisolutionsHttpProvider } from '../../lib/providers/siisolutions-http.mjs';
import { createFiscalEmitter } from '../../lib/emit.mjs';
import { createHttpHandler } from '../../lib/http.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';
import { syntheticDocument } from '../helpers/dte-fixtures.mjs';
import { TEST_ALLOW_ALL } from '../helpers/allowlist.mjs';

const SALE = '11111111-1111-4111-8111-111111111111';
let server;
let baseUrl;
let behavior; // (req, res, n) => void
let posts = 0;
let gets = 0;

before(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.method === 'POST') posts += 1; else gets += 1;
      behavior(req, res, posts);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); return new Promise((r) => server.close(r)); });

const reply = (res, status, body) => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); } };
const okDoc = (folio) => ({ folio, esSimulacion: false, ...syntheticDocument({ folio, total: 2380 }) });

function setup({ adapterTimeoutMs = 2000, emitterTimeoutMs = 3000 } = {}) {
  posts = 0; gets = 0;
  const MASTER = randomBytes(32);
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: SALE });
  const provider = { ...createSiisolutionsHttpProvider({ baseUrl, timeoutMs: adapterTimeoutMs }), ready: true };
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider, masterKey: MASTER, timeoutMs: emitterTimeoutMs });
  const handle = createHttpHandler({ emitter, resolveUser: async () => IDS.userA });
  const call = (action) => handle({ method: 'POST', authHeader: 'Bearer t', body: { action, saleId: SALE } });
  const row = () => store.issuances.get(`${IDS.bizA}|${SALE}`);
  return { store, emitter, call, row };
}

test('respuesta tardía (llega después del plazo del adaptador): unknown, una sola llamada, sin reintento', async () => {
  const { call, row } = setup({ adapterTimeoutMs: 150 });
  behavior = (req, res) => setTimeout(() => reply(res, 200, okDoc(51300)), 400);
  const r = await call('emit');
  assert.equal(r.status, 202);
  assert.equal(r.body.status, 'unknown');
  assert.equal(row().status, 'unknown');
  assert.equal(row().errorCode, 'PROVIDER_TIMEOUT');
  await new Promise((ok) => setTimeout(ok, 450)); // la respuesta tardía llega y se ignora
  assert.equal(row().status, 'unknown');
  const again = await call('emit');
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'UNKNOWN_REQUIRES_RECONCILIATION');
  assert.equal(posts, 1);
});

test('respuesta tardía frente al plazo del emisor: el documento que llega luego no marca issued', async () => {
  const { call, row } = setup({ adapterTimeoutMs: 2000, emitterTimeoutMs: 150 });
  behavior = (req, res) => setTimeout(() => reply(res, 200, okDoc(51301)), 400);
  const r = await call('emit');
  assert.equal(r.body.status, 'unknown');
  await new Promise((ok) => setTimeout(ok, 500));
  assert.equal(row().status, 'unknown');
  assert.equal(row().pdfBase64, null);
  assert.equal(posts, 1);
});

test('doble clic: dos solicitudes simultáneas -> una sola llamada a DTE Core y un solo folio', async () => {
  const { call, row } = setup();
  behavior = (req, res) => setTimeout(() => reply(res, 200, okDoc(51302)), 100);
  const [a, b] = await Promise.all([call('emit'), call('emit')]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409).body.error, 'ALREADY_IN_PROGRESS');
  assert.equal(posts, 1);
  assert.equal(row().folio, 51302);
});

test('reintento del cliente tras éxito (respuesta perdida en el navegador): no reemite', async () => {
  const { call } = setup();
  behavior = (req, res) => reply(res, 200, okDoc(51303));
  await call('emit');
  const retry = await call('emit');
  assert.equal(retry.status, 200);
  assert.equal(retry.body.alreadyIssued, true);
  assert.equal(retry.body.folio, 51303);
  assert.equal(posts, 1);
});

test('corte de conexión del proveedor a mitad de respuesta: unknown, sin reintento', async () => {
  const { call, row } = setup();
  behavior = (req, res) => res.socket.destroy();
  const r = await call('emit');
  assert.equal(r.body.status, 'unknown');
  assert.equal(row().errorCode, 'PROVIDER_NETWORK');
  assert.equal(posts, 1);
});

test('consulta y reimpresión de una boleta existente: devuelven folio y PDF guardados sin llamar a DTE Core', async () => {
  const { call } = setup();
  behavior = (req, res) => reply(res, 200, okDoc(51304));
  await call('emit');
  posts = 0; gets = 0;
  const st = await call('status');
  assert.equal(st.status, 200);
  assert.equal(st.body.state, 'issued');
  assert.equal(st.body.folio, 51304);
  assert.equal(st.body.siiStatus, 'unverified');
  assert.equal(st.body.canEmit, false);
  const rp = await call('reprint');
  assert.equal(rp.status, 200);
  assert.equal(rp.body.folio, 51304);
  assert.equal(Buffer.from(rp.body.pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.equal(posts + gets, 0);
});

test('reimpresión de una venta sin boleta: NOT_ISSUED, nunca emite', async () => {
  const { call } = setup();
  behavior = () => assert.fail('no debe llamar al proveedor');
  const rp = await call('reprint');
  assert.equal(rp.status, 404);
  assert.equal(rp.body.error, 'NOT_ISSUED');
  assert.equal(posts + gets, 0);
});
