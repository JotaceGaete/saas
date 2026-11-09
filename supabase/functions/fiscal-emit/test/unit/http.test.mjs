import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { createHttpHandler } from '../../lib/http.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';
import { TEST_ALLOW_ALL } from '../helpers/allowlist.mjs';
import { parseAllowedIssuers } from '../../lib/allowlist.mjs';

const MASTER = randomBytes(32);
const UUID_SALE = '3f1c2b1e-7d2a-4c1e-9a77-2b6f0c1d9e11';

function build({ scenario = 'ok' } = {}) {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: UUID_SALE });
  const provider = createSimulatedProvider({ scenario });
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider, masterKey: MASTER });
  const resolveUser = async (h) => (h === 'Bearer token-a' ? IDS.userA : h === 'Bearer token-b' ? IDS.userB : null);
  return { store, provider, handle: createHttpHandler({ emitter, resolveUser }) };
}


test('sin token o con token inválido -> 401, sin tocar nada', async () => {
  const { provider, handle } = build();
  assert.equal((await handle({ method: 'POST', authHeader: null, body: { action: 'emit', saleId: UUID_SALE } })).status, 401);
  assert.equal((await handle({ method: 'POST', authHeader: 'Bearer nope', body: { action: 'emit', saleId: UUID_SALE } })).status, 401);
  assert.equal(provider.calls, 0);
});

test('método distinto de POST -> 405', async () => {
  const { handle } = build();
  assert.equal((await handle({ method: 'GET', authHeader: 'Bearer token-a', body: null })).status, 405);
});

test('campos no permitidos se rechazan: business_id, folio, medioPago, montos', async () => {
  const { provider, handle } = build();
  for (const extra of ['businessId', 'business_id', 'folio', 'medioPago', 'amount', 'montoPago']) {
    const r = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: UUID_SALE, [extra]: IDS.bizB } });
    assert.equal(r.status, 400, extra);
    assert.equal(r.body.error, 'UNKNOWN_FIELD');
  }
  assert.equal(provider.calls, 0);
});

test('saleId inválido o acción desconocida -> 400', async () => {
  const { handle } = build();
  assert.equal((await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: 'no-uuid' } })).body.error, 'INVALID_SALE_ID');
  assert.equal((await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'reconcile', saleId: UUID_SALE } })).body.error, 'UNKNOWN_ACTION');
  assert.equal((await handle({ method: 'POST', authHeader: 'Bearer token-a', body: ['x'] })).status, 400);
});

test('emisión feliz -> 200 con folio, sin XML ni PDF en la respuesta', async () => {
  const { store, handle } = build();
  const sale = { id: UUID_SALE };
  const r = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: sale.id } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'issued');
  assert.equal(typeof r.body.folio, 'number');
  assert.equal('pdfBase64' in r.body, false);
  assert.equal('xmlBase64' in r.body, false);
});

test('unknown -> 202 y sin detalles internos', async () => {
  const { store, handle } = build({ scenario: 'timeout' });
  const sale = { id: UUID_SALE };
  const r = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: sale.id } });
  assert.equal(r.status, 202);
  assert.equal(r.body.status, 'unknown');
});

test('otro comercio -> 404 SALE_NOT_FOUND, sin revelar existencia', async () => {
  const { store, provider, handle } = build();
  const sale = { id: UUID_SALE };
  const r = await handle({ method: 'POST', authHeader: 'Bearer token-b', body: { action: 'emit', saleId: sale.id } });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'SALE_NOT_FOUND');
  const missing = await handle({ method: 'POST', authHeader: 'Bearer token-b', body: { action: 'emit', saleId: '00000000-0000-4000-8000-000000000000' } });
  assert.deepEqual(missing.body, r.body);
  assert.equal(provider.calls, 0);
});

test('error interno no clasificado -> 500 INTERNAL, sin mensaje', async () => {
  const emitter = { emitSale: async () => { throw new Error('secret db password leaked'); }, reprint: async () => null };
  const handle = createHttpHandler({ emitter, resolveUser: async () => IDS.userA });
  const r = await handle({ method: 'POST', authHeader: 'x', body: { action: 'emit', saleId: UUID_SALE } });
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: 'INTERNAL' });
  assert.equal(JSON.stringify(r.body).includes('password'), false);
});

test('reimpresión devuelve el PDF guardado solo al dueño', async () => {
  const { store, handle } = build();
  const sale = { id: UUID_SALE };
  await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: sale.id } });
  const ok = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'reprint', saleId: sale.id } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.pdfBase64);
  const other = await handle({ method: 'POST', authHeader: 'Bearer token-b', body: { action: 'reprint', saleId: sale.id } });
  assert.equal(other.status, 404);
});

test('la clave de operación de la venta es WLK-<business>-<sale>', () => {
  assert.equal(operationIdFor('B', 'S'), 'WLK-B-S');
});

test('rol insuficiente -> 403 FISCAL_ROLE_REQUIRED, sin llamar al proveedor', async () => {
  const { store, provider, handle } = build();
  store.revokeRole(IDS.bizA, IDS.userA, 'fiscal_owner');
  store.grantRole(IDS.bizA, IDS.userA, 'fiscal_viewer');
  const r = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: UUID_SALE } });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'FISCAL_ROLE_REQUIRED' });
  assert.equal(provider.calls, 0);
});

test('viewer puede reimprimir pero no emitir', async () => {
  const { store, handle } = build();
  await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: UUID_SALE } });
  store.revokeRole(IDS.bizA, IDS.userA, 'fiscal_owner');
  store.grantRole(IDS.bizA, IDS.userA, 'fiscal_viewer');
  assert.equal((await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'reprint', saleId: UUID_SALE } })).status, 200);
});

test('persistencia pendiente de recuperación -> 409 PERSIST_PENDING_RECOVERY (el cliente no reintenta)', async () => {
  const { store, provider, handle } = build();
  store.injectFault('finalize', { mode: 'before', times: 99 });
  const r = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: UUID_SALE } });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'PERSIST_PENDING_RECOVERY' });
  assert.equal(provider.calls, 1);
  const again = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action: 'emit', saleId: UUID_SALE } });
  assert.equal(again.body.error, 'NOT_EMITTABLE_IN_STATE');
  assert.equal(provider.calls, 1);
});

test('el manejador no tiene ruta de reconciliación ni de recuperación', async () => {
  const { handle } = build();
  for (const action of ['reconcile', 'recover', 'recoverStaleSending']) {
    const r = await handle({ method: 'POST', authHeader: 'Bearer token-a', body: { action, saleId: UUID_SALE } });
    assert.equal(r.body.error, 'UNKNOWN_ACTION', action);
  }
});

// --- Consultas (lookup, sii-status) y lista de empresas ------------------------------------------

const B_OK = 'b72b5a55-8ce6-4d1b-99b1-0a3a618f0930';
const R_OK = '76123456-0';

function buildQueries({ allow = `${B_OK}=${R_OK}`, emitScenario = 'network' } = {}) {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: B_OK, userId: IDS.userA, saleId: UUID_SALE, issuerRut: R_OK });
  const sim = createSimulatedProvider({ scenario: emitScenario });
  const calls = { emit: 0, lookup: 0, sii: 0 };
  const provider = {
    name: 'dtecore',
    ready: true,
    emit: async (a) => { calls.emit += 1; return sim.emit(a); },
    lookupOperation: async () => { calls.lookup += 1; return { result: 'not_found' }; },
    retrieveDocuments: async () => null,
    getSiiStatus: async () => { calls.sii += 1; return { result: 'ok', siiStatus: 'received', rawState: 'RECIBIDO', trackId: null }; },
  };
  const emitter = createFiscalEmitter({ allowedIssuers: parseAllowedIssuers(allow), store, provider, masterKey: MASTER, timeoutMs: 200 });
  const resolveUser = async (h) => (h === 'Bearer token-a' ? IDS.userA : h === 'Bearer token-b' ? IDS.userB : null);
  return { store, calls, handle: createHttpHandler({ emitter, resolveUser }) };
}

const post = (handle, auth, body) => handle({ method: 'POST', authHeader: auth, body });

test('lookup y sii-status exigen sesión y solo aceptan {action, saleId}', async () => {
  const { handle, calls } = buildQueries();
  for (const action of ['lookup', 'sii-status']) {
    assert.equal((await post(handle, null, { action, saleId: UUID_SALE })).status, 401);
    assert.equal((await post(handle, 'Bearer nope', { action, saleId: UUID_SALE })).status, 401);
    const extra = await post(handle, 'Bearer token-a', { action, saleId: UUID_SALE, businessId: B_OK });
    assert.equal(extra.body.error, 'UNKNOWN_FIELD');
    const folio = await post(handle, 'Bearer token-a', { action, saleId: UUID_SALE, folio: 1 });
    assert.equal(folio.body.error, 'UNKNOWN_FIELD');
    assert.equal((await post(handle, 'Bearer token-a', { action, saleId: 'x' })).body.error, 'INVALID_SALE_ID');
  }
  assert.deepEqual(calls, { emit: 0, lookup: 0, sii: 0 });
});

test('lookup: usuario de otro negocio -> 404; venta sin resultado desconocido -> 409', async () => {
  const { handle, calls } = buildQueries();
  assert.equal((await post(handle, 'Bearer token-b', { action: 'lookup', saleId: UUID_SALE })).status, 404);
  const r = await post(handle, 'Bearer token-a', { action: 'lookup', saleId: UUID_SALE });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'NOT_UNKNOWN');
  assert.equal(calls.lookup, 0);
});

test('lookup tras un resultado desconocido: 200 de consulta, sin emitir; emit sigue bloqueado', async () => {
  const { handle, calls, store } = buildQueries();
  assert.equal((await post(handle, 'Bearer token-a', { action: 'emit', saleId: UUID_SALE })).body.status, 'unknown');
  const r = await post(handle, 'Bearer token-a', { action: 'lookup', saleId: UUID_SALE });
  assert.equal(r.status, 200);
  assert.equal(r.body.result, 'not_found');
  assert.equal(r.body.state, 'unknown');
  assert.equal(calls.emit, 1);
  assert.equal((await post(handle, 'Bearer token-a', { action: 'emit', saleId: UUID_SALE })).status, 409);
  assert.equal(calls.emit, 1);
  assert.equal(JSON.stringify(r.body).includes('TEST-KEY'), false, 'la respuesta no contiene la clave');
  assert.equal(store.issuances.size, 1);
});

test('empresa fuera de la lista: emit, lookup y sii-status -> 403 sin llamar al proveedor', async () => {
  const { handle, calls } = buildQueries({ allow: '' });
  for (const action of ['emit', 'lookup', 'sii-status']) {
    const r = await post(handle, 'Bearer token-a', { action, saleId: UUID_SALE });
    assert.equal(r.status, 403, action);
    assert.equal(r.body.error, 'FISCAL_BUSINESS_NOT_ALLOWED');
  }
  assert.deepEqual(calls, { emit: 0, lookup: 0, sii: 0 });
});

test('sii-status de una boleta emitida: registra recibida; sin boleta -> 404', async () => {
  const none = buildQueries({ emitScenario: 'ok' });
  assert.equal((await post(none.handle, 'Bearer token-a', { action: 'sii-status', saleId: UUID_SALE })).status, 404);
  assert.equal((await post(none.handle, 'Bearer token-a', { action: 'emit', saleId: UUID_SALE })).body.status, 'issued');
  const r = await post(none.handle, 'Bearer token-a', { action: 'sii-status', saleId: UUID_SALE });
  assert.equal(r.status, 200);
  assert.equal(r.body.siiStatus, 'received');
  assert.equal(r.body.updated, true);
  assert.equal(none.calls.emit, 1);
});
