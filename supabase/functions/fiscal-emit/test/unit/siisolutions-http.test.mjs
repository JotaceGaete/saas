// Adaptador HTTP de SII Solutions contra un servidor LOCAL que reproduce las respuestas
// documentadas en la colección Postman. Ninguna prueba sale a la red ni consume folios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createSiisolutionsHttpProvider } from '../../lib/providers/siisolutions-http.mjs';
import { ProviderRejectedError } from '../../lib/errors.mjs';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';

let server;
let baseUrl;
let next = null; // { status, body } que devuelve el siguiente request
let lastReq = null;
let requests = 0;

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      requests += 1;
      lastReq = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      if (next?.hang) return; // nunca responde: prueba de plazo
      res.writeHead(next.status, { 'content-type': 'application/json' });
      res.end(typeof next.body === 'string' ? next.body : JSON.stringify(next.body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

const PAYLOAD = {
  rutOperador: '76123456-7',
  idBoletaOperacion: 'op-test-1',
  detalles: [{ linea: 1, descripcion: 'Producto', precio: 1000, cantidad: 1, esExento: false }],
  medioPago: 'EF',
  montoPago: 1000,
  retornarPdf: true,
  formatoPdf: '80mm',
  modoPdfSalida: 'base64',
  retornarXml: true,
  enviarCorreo: false,
};
const CREDS = { apiKey: 'CLAVE-DE-PRUEBA' };

test('200: devuelve folio, XML y PDF; envía X-Api-Key y el cuerpo tal cual', async () => {
  next = { status: 200, body: { folio: 1, esSimulacion: false, xmlBase64: 'PD94', pdfBase64: 'JVBE' } };
  const p = createSiisolutionsHttpProvider({ baseUrl });
  const doc = await p.emit({ payload: PAYLOAD, credentials: CREDS });
  assert.deepEqual(doc, { folio: 1, xmlBase64: 'PD94', pdfBase64: 'JVBE' });
  assert.equal(lastReq.method, 'POST');
  assert.equal(lastReq.url, '/dte/boletas/emitir');
  assert.equal(lastReq.headers['x-api-key'], 'CLAVE-DE-PRUEBA');
  assert.deepEqual(lastReq.body, PAYLOAD);
});

test('200 con esSimulacion=true: nunca es una emisión real', async () => {
  next = { status: 200, body: { folio: 1, esSimulacion: true, xmlBase64: 'x', pdfBase64: 'y' } };
  const p = createSiisolutionsHttpProvider({ baseUrl });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: CREDS }), { code: 'PROVIDER_SIMULATION' });
});

test('400 sin folios: rechazo explícito (ProviderRejectedError), sin folio', async () => {
  next = { status: 400, body: { success: false, error: 'No hay folios disponibles para el tipo de DTE 39. Sube un CAF.', codigoDte: 39, traceId: 't', hint: null } };
  const p = createSiisolutionsHttpProvider({ baseUrl });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: CREDS }), (e) => e instanceof ProviderRejectedError);
});

test('400 de validación: también rechazo explícito', async () => {
  next = { status: 400, body: { success: false, error: 'El campo Cliente.RutReceptor es requerido.', codigoDte: 39 } };
  const p = createSiisolutionsHttpProvider({ baseUrl });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: CREDS }), (e) => e instanceof ProviderRejectedError);
});

test('401: no es rechazo del documento; código PROVIDER_AUTH (el emisor lo deja unknown)', async () => {
  next = { status: 401, body: { error: 'Credenciales inválidas' } };
  const p = createSiisolutionsHttpProvider({ baseUrl });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: CREDS }), (e) => {
    assert.equal(e.code, 'PROVIDER_AUTH');
    return !(e instanceof ProviderRejectedError);
  });
});

test('500: código PROVIDER_HTTP_500', async () => {
  next = { status: 500, body: 'internal' };
  const p = createSiisolutionsHttpProvider({ baseUrl });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: CREDS }), { code: 'PROVIDER_HTTP_500' });
});

test('200 con cuerpo no JSON: el documento queda incompleto y el emisor no lo marca issued', async () => {
  next = { status: 200, body: 'no-json' };
  const p = createSiisolutionsHttpProvider({ baseUrl });
  const doc = await p.emit({ payload: PAYLOAD, credentials: CREDS });
  assert.equal(doc.folio, null);
  assert.equal(doc.pdfBase64, null);
});

test('sin plazo de respuesta: el adaptador falla y no devuelve folio', async () => {
  next = { hang: true };
  const p = createSiisolutionsHttpProvider({ baseUrl, timeoutMs: 150 });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: CREDS }));
  next = null;
});

test('sin clave: falla antes de cualquier red', async () => {
  let called = 0;
  const p = createSiisolutionsHttpProvider({ baseUrl, fetchImpl: async () => { called += 1; } });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: {} }), { code: 'PROVIDER_AUTH' });
  assert.equal(called, 0);
});

test('baseUrl: https obligatorio salvo loopback para pruebas', () => {
  assert.throws(() => createSiisolutionsHttpProvider({ baseUrl: 'http://api.ejemplo.cl' }));
  assert.throws(() => createSiisolutionsHttpProvider({ baseUrl: 'no-es-url' }));
  assert.equal(createSiisolutionsHttpProvider({ baseUrl: 'https://api.siisolutions.cl' }).ready, false);
});

test('integración con el emisor: el reclamo guarda el documento solo con resultado completo', async () => {
  const MASTER = randomBytes(32);
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const adapter = createSiisolutionsHttpProvider({ baseUrl });
  // Solo en la prueba se fuerza ready=true para ejercitar el flujo; el adaptador real sigue en false.
  const provider = { ...adapter, ready: true };
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER, timeoutMs: 1000 });

  next = { status: 200, body: { folio: 7, esSimulacion: false, xmlBase64: 'PD94', pdfBase64: 'JVBE' } };
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 7);
  assert.equal(lastReq.body.idBoletaOperacion, operationIdFor(IDS.bizA, IDS.saleA));
});

// Flujo completo TPV -> emisor -> adaptador -> servidor simulado -> almacén.
async function runSale(status, body) {
  const MASTER = randomBytes(32);
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const provider = { ...createSiisolutionsHttpProvider({ baseUrl }), ready: true };
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER, timeoutMs: 1000 });
  next = { status, body };
  requests = 0;
  const result = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }).catch((e) => ({ error: e }));
  return { store, result, emitter, row: store.issuances.get(`${IDS.bizA}|${IDS.saleA}`) };
}

test('flujo completo 200: guarda folio, XML y PDF; el payload enviado sigue el contrato', async () => {
  const { result, row } = await runSale(200, { folio: 7, esSimulacion: false, xmlBase64: 'PD94', pdfBase64: 'JVBE' });
  assert.equal(result.status, 'issued');
  assert.equal(result.folio, 7);
  assert.equal(row.status, 'issued');
  assert.equal(row.folio, 7);
  assert.equal(row.xmlBase64, 'PD94');
  assert.equal(row.pdfBase64, 'JVBE');
  assert.equal(requests, 1);
  assert.equal(lastReq.body.folio, null);
  assert.equal(typeof lastReq.body.montoPago, 'string');
  assert.equal(typeof lastReq.body.total, 'number');
  assert.equal(lastReq.body.idBoletaOperacion, operationIdFor(IDS.bizA, IDS.saleA));
});

test('flujo completo: una segunda emisión de la misma venta no vuelve a llamar al servidor', async () => {
  const { emitter } = await runSale(200, { folio: 8, esSimulacion: false, xmlBase64: 'PD94', pdfBase64: 'JVBE' });
  requests = 0;
  const again = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(again.status, 'issued');
  assert.equal(again.alreadyIssued, true);
  assert.equal(requests, 0);
});

test('flujo completo 400 de validación: la venta queda failed, sin folio, sin reintento', async () => {
  const { result, row } = await runSale(400, { success: false, error: 'El campo Cliente.RutReceptor es requerido.' });
  assert.equal(result.status, 'failed');
  assert.equal(row.status, 'failed');
  assert.equal(row.folio, null);
  assert.equal(requests, 1);
});

test('flujo completo 500: resultado incierto (unknown), sin reintento automático', async () => {
  const { result, row } = await runSale(500, 'boom');
  assert.equal(result.status, 'unknown');
  assert.equal(row.status, 'unknown');
  assert.equal(row.folio, null);
  assert.equal(requests, 1);
});
