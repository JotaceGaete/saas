import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { createHttpHandler } from '../../lib/http.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';

const MASTER = randomBytes(32);
const UUID_SALE = '3f1c2b1e-7d2a-4c1e-9a77-2b6f0c1d9e11';

function build({ scenario = 'ok' } = {}) {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: UUID_SALE });
  const provider = createSimulatedProvider({ scenario });
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER });
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
