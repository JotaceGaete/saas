// Reclamo con credenciales (almacén en memoria). Mismo contrato que crm_fiscal_claim_with_credentials:
// las credenciales se leen DENTRO del reclamo, y cualquier fallo antes de llamar al proveedor libera
// el reclamo para que la venta pueda reintentarse. Ningún fallo local llama al proveedor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { seal } from '../../lib/secrets.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';

const MASTER = randomBytes(32);
const OP_A = operationIdFor(IDS.bizA, IDS.saleA);
const ROW_A = `${IDS.bizA}|${IDS.saleA}`;

function setup() {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const provider = createSimulatedProvider({ scenario: 'ok', delayMs: 5 });
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER, timeoutMs: 200 });
  return { store, provider, emitter };
}

test('credenciales que no se descifran: se libera el reclamo, cero llamadas al proveedor, y se puede reintentar', async () => {
  const { store, provider, emitter } = setup();
  // Credencial sellada con OTRA clave maestra: no se puede abrir.
  store.creds.set(IDS.bizA, seal({ apiKey: 'X' }, { key: randomBytes(32), businessId: IDS.bizA }));
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'CREDENTIAL_INVALID' });
  assert.equal(provider.calls, 0);
  assert.equal(store.issuances.get(ROW_A).status, 'pending', 'el reclamo quedó liberado');

  // Se corrige la credencial y la misma venta se emite sin intervención manual.
  store.creds.set(IDS.bizA, seal({ apiKey: 'OK' }, { key: MASTER, businessId: IDS.bizA }));
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  assert.equal(provider.calls, 1);
  assert.equal(store.issuances.get(ROW_A).operationId, OP_A);
});

test('el proveedor recibe la clave que estaba vigente en el momento del reclamo', async () => {
  const { store, provider } = setup();
  let seen = null;
  const spy = { ...provider, emit: async (args) => { seen = args.credentials.apiKey; return provider.emit(args); } };
  const e2 = createFiscalEmitter({ store, provider: spy, masterKey: MASTER, timeoutMs: 200 });
  await e2.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(seen, `TEST-KEY-${IDS.bizA}`);
});

test('con reclamo ganado por otro proceso no se reclama ni se llama al proveedor', async () => {
  const { store, provider, emitter } = setup();
  store.issuances.set(ROW_A, { id: 'x', businessId: IDS.bizA, saleId: IDS.saleA, operationId: OP_A, status: 'sending', folio: null, pdfBase64: null });
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), (e) => ['NOT_EMITTABLE_IN_STATE', 'ALREADY_IN_PROGRESS'].includes(e.code));
  assert.equal(provider.calls, 0);
});
