// Adaptador real DTE Core contra un servidor LOCAL que reproduce las respuestas observadas
// (emisión 51106) y documentadas (400, 409). Ninguna prueba sale a la red ni consume folios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  createSiisolutionsHttpProvider, documentProblem, inspectDteXml, DTECORE_PRODUCTION_ORIGIN,
} from '../../lib/providers/siisolutions-http.mjs';
import { ProviderRejectedError } from '../../lib/errors.mjs';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';
import { syntheticDocument, syntheticDteXml, b64, SYNTHETIC_PDF_B64 } from '../helpers/dte-fixtures.mjs';

let server;
let baseUrl;
let next = null; // { status, body } del siguiente POST
let docs = {}; // `${folio}/${kind}` -> { status, type, body }
let log = [];

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      log.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
      if (req.method === 'GET') {
        const m = /^\/dte\/documentos\/39\/(\d+)\/(xml|pdf)$/.exec(req.url);
        const d = m && docs[`${m[1]}/${m[2]}`];
        if (!d) { res.writeHead(404); return res.end(); }
        res.writeHead(d.status ?? 200, { 'content-type': d.type });
        return res.end(d.body);
      }
      if (next?.hang) return;
      res.writeHead(next.status, { 'content-type': 'application/json' });
      res.end(typeof next.body === 'string' ? next.body : JSON.stringify(next.body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

const reset = () => { log = []; docs = {}; next = null; };
const posts = () => log.filter((r) => r.method === 'POST');
const PAYLOAD = { rutOperador: '76123456-7', idBoletaOperacion: 'op-test-1', detalles: [], medioPago: 'EF', montoPago: '1000' };
const CREDS = { apiKey: 'CLAVE-DE-PRUEBA' };
const EXPECT = { total: 1000, rutEmisor: '76123456-7' };
const provider = (o = {}) => createSiisolutionsHttpProvider({ baseUrl, ...o });
const okBody = (folio, extra = {}) => ({ folio, esSimulacion: false, ...syntheticDocument({ folio, total: 1000 }), ...extra });

test('200 con XML y PDF inline válidos: documento; X-Api-Key, cuerpo tal cual, sin redirecciones', async () => {
  reset();
  next = { status: 200, body: okBody(51200) };
  const doc = await provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT });
  assert.equal(doc.folio, 51200);
  assert.equal(inspectDteXml(doc.xmlBase64).folio, 51200);
  assert.equal(posts().length, 1);
  assert.equal(log[0].url, '/dte/boletas/emitir');
  assert.equal(log[0].headers['x-api-key'], 'CLAVE-DE-PRUEBA');
  assert.deepEqual(log[0].body, PAYLOAD);
});

test('200 sin documentos inline (forma de la 51106: documentos.{xml,pdf}): los recupera por GET, sin segundo POST', async () => {
  reset();
  const d = syntheticDocument({ folio: 51201, total: 1000 });
  next = { status: 200, body: { folio: 51201, esSimulacion: false, pdfEstado: 'generado',
    documentos: { xml: `${DTECORE_PRODUCTION_ORIGIN}/dte/documentos/39/51201/xml`, pdf: `${DTECORE_PRODUCTION_ORIGIN}/dte/documentos/39/51201/pdf` } } };
  docs['51201/xml'] = { type: 'application/xml', body: Buffer.from(d.xmlBase64, 'base64') };
  docs['51201/pdf'] = { type: 'application/json', body: JSON.stringify({ pdfBase64: d.pdfBase64 }) };
  const doc = await provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT });
  assert.equal(doc.folio, 51201);
  assert.equal(doc.xmlBase64, d.xmlBase64);
  assert.equal(doc.pdfBase64, d.pdfBase64);
  assert.equal(posts().length, 1);
  assert.deepEqual(log.filter((r) => r.method === 'GET').map((r) => r.url), ['/dte/documentos/39/51201/xml', '/dte/documentos/39/51201/pdf']);
});

test('200 con folio pero documentos no recuperables: unknown CON folio (pista para reconciliar)', async () => {
  reset();
  next = { status: 200, body: { folio: 51202, esSimulacion: false } };
  await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT }),
    (e) => e.code === 'FOLIO_ASSIGNED_DOCUMENTS_NOT_RETRIEVED' && e.folio === 51202);
  assert.equal(posts().length, 1);
});

test('XML que no corresponde: folio, total, emisor, tipo o timbre distintos -> unknown con folio', async () => {
  const cases = [
    [{ xmlBase64: b64(syntheticDteXml({ folio: 9, total: 1000 })) }, 'XML_FOLIO_MISMATCH'],
    [{ xmlBase64: b64(syntheticDteXml({ folio: 51203, total: 1190 })) }, 'XML_TOTAL_MISMATCH'],
    [{ xmlBase64: b64(syntheticDteXml({ folio: 51203, total: 1000, rutEmisor: '11111111-1' })) }, 'XML_ISSUER_MISMATCH'],
    [{ xmlBase64: b64(syntheticDteXml({ folio: 51203, total: 1000, tipo: 33 })) }, 'XML_NOT_DTE39'],
    [{ xmlBase64: b64(syntheticDteXml({ folio: 51203, total: 1000, withTed: false })) }, 'XML_WITHOUT_TED'],
    [{ xmlBase64: b64(syntheticDteXml({ folio: 51203, total: 1000 }).replace(/<Signature[^>]*>[\s\S]*?<\/Signature>/, '')) }, 'XML_WITHOUT_SIGNATURE'],
    [{ pdfBase64: b64('<html>no es pdf</html>') }, 'PDF_INVALID'],
  ];
  for (const [override, code] of cases) {
    reset();
    next = { status: 200, body: okBody(51203, override) };
    await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT }),
      (e) => e.code === code && e.folio === 51203, code);
  }
});

test('esSimulacion true o ausente: nunca se marca emitido', async () => {
  reset();
  next = { status: 200, body: okBody(51204, { esSimulacion: true }) };
  await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT }), { code: 'PROVIDER_SIMULATION' });
  const { esSimulacion, ...noFlag } = okBody(51204);
  next = { status: 200, body: noFlag };
  await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT }), { code: 'RESPONSE_INVALID' });
});

test('200 sin folio o no JSON: unknown sin folio', async () => {
  reset();
  next = { status: 200, body: 'no-json' };
  await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT }), (e) => e.code === 'RESPONSE_WITHOUT_FOLIO' && e.folio === null);
});

test('409 operación ya existente: unknown con folioExistente, nunca un nuevo POST', async () => {
  reset();
  next = { status: 409, body: { success: false, error: 'Operación duplicada', folioExistente: 51106 } };
  await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS, expect: EXPECT }),
    (e) => e.code === 'PROVIDER_OPERATION_ALREADY_EXISTS' && e.folio === 51106);
  assert.equal(posts().length, 1);
});

test('400 con success=false: rechazo explícito (sin folio)', async () => {
  reset();
  next = { status: 400, body: { success: false, error: 'No hay folios disponibles para el tipo de DTE 39. Sube un CAF.' } };
  await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS }), (e) => e instanceof ProviderRejectedError);
});

test('400 sin success=false, 401, 403, 500: unknown (no es rechazo del documento)', async () => {
  for (const [status, body, code] of [[400, { error: 'x' }, 'PROVIDER_HTTP_400'], [401, {}, 'PROVIDER_AUTH'], [403, {}, 'PROVIDER_AUTH'], [500, 'boom', 'PROVIDER_HTTP_500']]) {
    reset();
    next = { status, body };
    await assert.rejects(provider().emit({ payload: PAYLOAD, credentials: CREDS }), (e) => e.code === code && !(e instanceof ProviderRejectedError), code);
  }
});

test('sin respuesta dentro del plazo: PROVIDER_TIMEOUT', async () => {
  reset();
  next = { hang: true };
  await assert.rejects(provider({ timeoutMs: 150 }).emit({ payload: PAYLOAD, credentials: CREDS }), { code: 'PROVIDER_TIMEOUT' });
});

test('sin clave: falla antes de cualquier red', async () => {
  let called = 0;
  const p = createSiisolutionsHttpProvider({ baseUrl, fetchImpl: async () => { called += 1; } });
  await assert.rejects(p.emit({ payload: PAYLOAD, credentials: {} }), { code: 'PROVIDER_AUTH' });
  assert.equal(called, 0);
});

test('origen fijo: solo https://api.siisolutions.cl (o loopback en pruebas); ready false por defecto', () => {
  assert.throws(() => createSiisolutionsHttpProvider({ baseUrl: 'http://api.siisolutions.cl' }));
  assert.throws(() => createSiisolutionsHttpProvider({ baseUrl: 'https://https://api.siisolutions.cl' }));
  assert.throws(() => createSiisolutionsHttpProvider({ baseUrl: 'https://api.ejemplo.cl' }));
  assert.throws(() => createSiisolutionsHttpProvider({ baseUrl: 'no-es-url' }));
  assert.equal(createSiisolutionsHttpProvider().ready, false);
  assert.equal(createSiisolutionsHttpProvider({ baseUrl: DTECORE_PRODUCTION_ORIGIN }).ready, false);
});

test('documentProblem acepta el documento sintético correcto', () => {
  assert.equal(documentProblem(syntheticDocument({ folio: 5, total: 100 }), { total: 100, rutEmisor: '76123456-7' }), null);
  assert.equal(documentProblem({ folio: 5, xmlBase64: 'no', pdfBase64: SYNTHETIC_PDF_B64 }), 'XML_INVALID');
});

// Flujo completo emisor -> adaptador -> servidor local -> almacén en memoria.
async function runSale(status, body, setupDocs) {
  reset();
  const MASTER = randomBytes(32);
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const prov = { ...createSiisolutionsHttpProvider({ baseUrl }), ready: true };
  const emitter = createFiscalEmitter({ store, provider: prov, masterKey: MASTER, timeoutMs: 2000 });
  setupDocs?.();
  next = { status, body };
  const result = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }).catch((e) => ({ error: e }));
  return { store, result, emitter, row: store.issuances.get(`${IDS.bizA}|${IDS.saleA}`) };
}
const saleDoc = (folio) => ({ folio, esSimulacion: false, ...syntheticDocument({ folio, total: 2380 }) });

test('flujo completo 200: issued con folio, XML y PDF; payload con precio bruto y operación determinista', async () => {
  const { result, row } = await runSale(200, saleDoc(7));
  assert.equal(result.status, 'issued');
  assert.equal(row.status, 'issued');
  assert.equal(row.folio, 7);
  assert.ok(row.xmlBase64 && row.pdfBase64);
  assert.equal(posts().length, 1);
  const sent = posts()[0].body;
  assert.equal(sent.idBoletaOperacion, operationIdFor(IDS.bizA, IDS.saleA));
  assert.equal(sent.detalles[0].precio, 1190); // bruto
  assert.equal(sent.montoPago, '2380');
  assert.equal('folio' in sent, false);
});

test('flujo completo: segunda emisión de la misma venta no llama al proveedor', async () => {
  const { emitter } = await runSale(200, saleDoc(8));
  log = [];
  const again = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(again.alreadyIssued, true);
  assert.equal(log.length, 0);
});

test('flujo completo XML con otro total: unknown con folio guardado, sin reintento ni PDF', async () => {
  const { result, row, emitter } = await runSale(200, { folio: 9, esSimulacion: false, ...syntheticDocument({ folio: 9, total: 1000 }) });
  assert.equal(result.status, 'unknown');
  assert.equal(result.folioHint, 9);
  assert.equal(row.status, 'unknown');
  assert.equal(row.folio, 9);
  assert.equal(row.errorCode, 'XML_TOTAL_MISMATCH');
  assert.equal(row.pdfBase64, null);
  log = [];
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  assert.equal(log.length, 0);
});

test('flujo completo 409: unknown con el folio existente', async () => {
  const { result, row } = await runSale(409, { folioExistente: 51106 });
  assert.equal(result.status, 'unknown');
  assert.equal(row.folio, 51106);
  assert.equal(row.errorCode, 'PROVIDER_OPERATION_ALREADY_EXISTS');
});

test('flujo completo 400 de validación: failed, sin folio, una sola llamada', async () => {
  const { result, row } = await runSale(400, { success: false, error: 'El campo Cliente.RutReceptor es requerido.' });
  assert.equal(result.status, 'failed');
  assert.equal(row.folio, null);
  assert.equal(posts().length, 1);
});

test('flujo completo 500: unknown sin folio, sin reintento automático', async () => {
  const { result, row } = await runSale(500, 'boom');
  assert.equal(result.status, 'unknown');
  assert.equal(row.folio, null);
  assert.equal(posts().length, 1);
});

test('status: antes de emitir canEmit true; después ALREADY_ISSUED con estado SII separado', async () => {
  reset();
  const MASTER = randomBytes(32);
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const prov = { ...createSiisolutionsHttpProvider({ baseUrl }), ready: true };
  const emitter = createFiscalEmitter({ store, provider: prov, masterKey: MASTER, timeoutMs: 2000 });
  const before = await emitter.status({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(before.state, 'none');
  assert.equal(before.canEmit, true);
  assert.equal(log.length, 0); // status no llama al proveedor
  next = { status: 200, body: saleDoc(10) };
  await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  const after = await emitter.status({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(after.state, 'issued');
  assert.equal(after.folio, 10);
  assert.equal(after.canEmit, false);
  assert.equal(after.blockedReason, 'ALREADY_ISSUED');
  assert.equal(after.siiStatus, 'unverified'); // emitido != aceptado por el SII
  assert.equal(after.hasPdf, true);
});
