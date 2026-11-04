// Consultas de solo lectura del adaptador DTE Core: operación por idBoletaOperacion y estado SII.
// fetch falso: ninguna prueba sale a la red. Se verifica que NUNCA se use POST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  createSiisolutionsHttpProvider, parseOperationLookup, mapSiiStatus, operationPath, siiStatusPath, DTECORE_PRODUCTION_ORIGIN,
} from '../../lib/providers/siisolutions-http.mjs';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { parseAllowedIssuers } from '../../lib/allowlist.mjs';
import { createMemoryStore } from '../helpers/memory-store.mjs';
import { syntheticDocument } from '../helpers/dte-fixtures.mjs';

const OP = 'WLK-b72b5a55-8ce6-4d1b-99b1-0a3a618f0930-1cb7e06b-a326-4f1a-a6bb-785d03c85133';
const CREDS = { apiKey: 'CLAVE-DE-PRUEBA-0123456789' };

// fetch falso: routes[`${method} ${path}`] -> { status, body, type } | Error
function fakeFetch(routes) {
  const log = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const k = `${init.method ?? 'GET'} ${u.pathname}`;
    log.push({ method: init.method ?? 'GET', url, path: u.pathname, headers: init.headers ?? {} });
    const r = typeof routes === 'function' ? routes(k) : routes[k];
    if (r instanceof Error) throw r;
    if (!r) return new Response('', { status: 404 });
    const body = typeof r.body === 'string' || r.body instanceof Uint8Array ? r.body : JSON.stringify(r.body ?? null);
    return new Response(body, { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'application/json' } });
  };
  return { impl, log };
}

test('rutas: solo GET bajo el origen fijo de DTE Core, con el id codificado', () => {
  assert.equal(operationPath(OP), `/dte/operaciones/39/${OP}`);
  assert.equal(operationPath('a/b?c'), '/dte/operaciones/39/a%2Fb%3Fc');
  assert.equal(siiStatusPath(51106), '/dte/emitidos/39/51106/envio-sii');
});

test('parseOperationLookup: solo un folio explícito cuenta como encontrado', () => {
  assert.deepEqual(parseOperationLookup(404, null, OP), { result: 'not_found' });
  assert.deepEqual(parseOperationLookup(200, { folio: 51106 }, OP), { result: 'found', folio: 51106 });
  assert.deepEqual(parseOperationLookup(200, { data: { folio: '51106', codigoDte: 39, idBoletaOperacion: OP } }, OP), { result: 'found', folio: 51106 });
  assert.equal(parseOperationLookup(200, { estado: 'EN_PROCESO' }, OP).code, 'OPERATION_WITHOUT_FOLIO');
  assert.equal(parseOperationLookup(200, { folio: 5, codigoDte: 33 }, OP).code, 'OPERATION_TYPE_MISMATCH');
  assert.equal(parseOperationLookup(200, { folio: 5, idBoletaOperacion: 'WLK-otra' }, OP).code, 'OPERATION_ID_MISMATCH');
  assert.equal(parseOperationLookup(200, { folio: 5, esSimulacion: true }, OP).code, 'PROVIDER_SIMULATION');
  assert.equal(parseOperationLookup(200, null, OP).code, 'RESPONSE_UNRECOGNIZED');
  assert.equal(parseOperationLookup(200, [{ folio: 5 }], OP).code, 'RESPONSE_UNRECOGNIZED');
  assert.equal(parseOperationLookup(200, { folio: -1 }, OP).result, 'indeterminate');
  assert.equal(parseOperationLookup(200, { folio: 1.5 }, OP).result, 'indeterminate');
  assert.equal(parseOperationLookup(401, null, OP).code, 'PROVIDER_AUTH');
  assert.equal(parseOperationLookup(500, { folio: 5 }, OP).code, 'PROVIDER_HTTP_500');
  assert.equal(parseOperationLookup(302, null, OP).result, 'indeterminate');
});

test('lookupOperation: GET con X-Api-Key, sin POST; red caída = indeterminado', async () => {
  const f = fakeFetch({ [`GET /dte/operaciones/39/${OP}`]: { body: { folio: 900 } } });
  const p = createSiisolutionsHttpProvider({ fetchImpl: f.impl, ready: true });
  assert.deepEqual(await p.lookupOperation({ operationId: OP, credentials: CREDS }), { result: 'found', folio: 900 });
  assert.equal(f.log.length, 1);
  assert.equal(f.log[0].method, 'GET');
  assert.equal(f.log[0].url, `${DTECORE_PRODUCTION_ORIGIN}/dte/operaciones/39/${OP}`);
  assert.equal(f.log[0].headers['X-Api-Key'], CREDS.apiKey);

  const down = fakeFetch(() => new TypeError('fetch failed'));
  const q = createSiisolutionsHttpProvider({ fetchImpl: down.impl, ready: true });
  assert.deepEqual(await q.lookupOperation({ operationId: OP, credentials: CREDS }), { result: 'indeterminate', code: 'PROVIDER_NETWORK' });

  const bad = fakeFetch({ [`GET /dte/operaciones/39/${OP}`]: { body: '<html>', type: 'text/html' } });
  const r = createSiisolutionsHttpProvider({ fetchImpl: bad.impl, ready: true });
  assert.equal((await r.lookupOperation({ operationId: OP, credentials: CREDS })).result, 'indeterminate');
});

test('lookupOperation: id inválido o sin clave no llama a la red', async () => {
  const f = fakeFetch({});
  const p = createSiisolutionsHttpProvider({ fetchImpl: f.impl, ready: true });
  for (const operationId of ['', 'a/b', '../x', 'x'.repeat(101), null, 7]) {
    assert.equal((await p.lookupOperation({ operationId, credentials: CREDS })).code, 'LOOKUP_INVALID');
  }
  assert.equal((await p.lookupOperation({ operationId: OP, credentials: {} })).code, 'LOOKUP_INVALID');
  assert.equal(f.log.length, 0);
});

test('mapSiiStatus: solo palabras inequívocas; códigos abreviados quedan sin interpretar', () => {
  assert.deepEqual(mapSiiStatus({ estado: 'ACEPTADO', trackId: 123456 }), { siiStatus: 'accepted', rawState: 'ACEPTADO', trackId: '123456' });
  assert.equal(mapSiiStatus({ data: { estadoSii: 'Aceptado con reparos' } }).siiStatus, 'accepted_with_objections');
  assert.equal(mapSiiStatus({ estado: 'Rechazado' }).siiStatus, 'rejected');
  assert.equal(mapSiiStatus({ status: 'recibido' }).siiStatus, 'received');
  for (const estado of ['EPR', 'DOK', 'RCT', 'RFR', 'OK', 'ACEPTADO?', 'NO ACEPTADO', '']) {
    assert.equal(mapSiiStatus({ estado }).siiStatus, null, estado);
  }
  assert.equal(mapSiiStatus(null).siiStatus, null);
  assert.equal(mapSiiStatus({ estado: 'ACEPTADO', trackId: 'abc' }).trackId, null);
  assert.ok(mapSiiStatus({ estado: 'x'.repeat(500) }).rawState.length <= 40);
});

test('getSiiStatus: GET del folio, sin POST; errores HTTP = indeterminado', async () => {
  const f = fakeFetch({ 'GET /dte/emitidos/39/51106/envio-sii': { body: { estado: 'ACEPTADO', trackId: '987' } } });
  const p = createSiisolutionsHttpProvider({ fetchImpl: f.impl, ready: true });
  assert.deepEqual(await p.getSiiStatus({ folio: 51106, credentials: CREDS }), { result: 'ok', siiStatus: 'accepted', rawState: 'ACEPTADO', trackId: '987' });
  assert.equal(f.log.every((r) => r.method === 'GET'), true);
  assert.equal((await p.getSiiStatus({ folio: 1, credentials: CREDS })).code, 'PROVIDER_HTTP_404');
  assert.equal((await p.getSiiStatus({ folio: 0, credentials: CREDS })).code, 'SII_STATUS_INVALID');
  const auth = createSiisolutionsHttpProvider({ fetchImpl: fakeFetch(() => ({ status: 403 })).impl, ready: true });
  assert.equal((await auth.getSiiStatus({ folio: 5, credentials: CREDS })).code, 'PROVIDER_AUTH');
});

// --- De punta a punta: emisor + adaptador real ----------------------------------------------

const B1 = 'b72b5a55-8ce6-4d1b-99b1-0a3a618f0930';
const R1 = '76123456-0';
const MASTER = randomBytes(32);

function e2e(routesFor) {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: B1, userId: 'u1', saleId: 's1', issuerRut: R1, total: 2380 });
  const op = operationIdFor(B1, 's1');
  const f = fakeFetch(routesFor(op));
  const provider = createSiisolutionsHttpProvider({ fetchImpl: f.impl, ready: true });
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER, allowedIssuers: parseAllowedIssuers(`${B1}=${R1}`), timeoutMs: 2000 });
  return { store, f, emitter, op };
}

const docRoutes = (folio, doc) => ({
  [`GET /dte/documentos/39/${folio}/xml`]: { body: doc.xmlBase64, type: 'text/plain' },
  [`GET /dte/documentos/39/${folio}/pdf`]: { body: doc.pdfBase64, type: 'text/plain' },
});

test('punta a punta: emisión sin respuesta -> unknown; la consulta encuentra y valida la boleta; un solo POST en total', async () => {
  const doc = syntheticDocument({ folio: 4242, total: 2380, rutEmisor: R1 });
  const { store, f, emitter, op } = e2e((op) => ({
    'POST /dte/boletas/emitir': new TypeError('fetch failed'),
    [`GET /dte/operaciones/39/${op}`]: { body: { folio: 4242, codigoDte: 39, idBoletaOperacion: op } },
    ...docRoutes(4242, doc),
  }));
  assert.equal((await emitter.emitSale({ actorUserId: 'u1', saleId: 's1' })).status, 'unknown');
  const r = await emitter.lookupOperation({ actorUserId: 'u1', saleId: 's1' });
  assert.equal(r.result, 'found');
  assert.equal(r.folio, 4242);
  assert.equal(r.documents, 'valid');
  assert.equal(store.issuances.get(`${B1}|s1`).status, 'unknown');
  // Reintentar emitir sigue bloqueado y no hace otro POST.
  await assert.rejects(emitter.emitSale({ actorUserId: 'u1', saleId: 's1' }), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  assert.equal(f.log.filter((x) => x.method === 'POST').length, 1);
  assert.ok(f.log.some((x) => x.path === `/dte/operaciones/39/${op}`));
});

test('punta a punta: documentos de otro emisor o por otro total no se aceptan', async () => {
  for (const doc of [
    syntheticDocument({ folio: 77, total: 2380, rutEmisor: '77654321-7' }),
    syntheticDocument({ folio: 77, total: 1190, rutEmisor: R1 }),
  ]) {
    const { emitter } = e2e((op) => ({
      'POST /dte/boletas/emitir': new TypeError('fetch failed'),
      [`GET /dte/operaciones/39/${op}`]: { body: { folio: 77 } },
      ...docRoutes(77, doc),
    }));
    await emitter.emitSale({ actorUserId: 'u1', saleId: 's1' });
    const r = await emitter.lookupOperation({ actorUserId: 'u1', saleId: 's1' });
    assert.equal(r.result, 'found');
    assert.equal(r.documents, 'not_retrieved');
  }
});

test('punta a punta: estado SII aceptado tras una emisión real (simulada en local)', async () => {
  const doc = syntheticDocument({ folio: 51200, total: 2380, rutEmisor: R1 });
  const { store, f, emitter } = e2e(() => ({
    'POST /dte/boletas/emitir': { body: { folio: 51200, esSimulacion: false, xmlBase64: doc.xmlBase64, pdfBase64: doc.pdfBase64 } },
    'GET /dte/emitidos/39/51200/envio-sii': { body: { estado: 'ACEPTADO', trackId: '24680' } },
  }));
  assert.equal((await emitter.emitSale({ actorUserId: 'u1', saleId: 's1' })).status, 'issued');
  const r = await emitter.refreshSiiStatus({ actorUserId: 'u1', saleId: 's1' });
  assert.equal(r.siiStatus, 'accepted');
  assert.equal(store.issuances.get(`${B1}|s1`).siiTrackId, '24680');
  assert.equal(f.log.filter((x) => x.method === 'POST').length, 1);
});
