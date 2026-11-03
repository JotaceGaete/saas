// Orquestador contra almacén en memoria. Mismas reglas que la prueba contra Postgres.
// Las reconciliaciones están en reconciler.test.mjs; los fallos de persistencia en failures.memory.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { createDtecoreBlockedProvider } from '../../lib/providers/dtecore-blocked.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';

const MASTER = randomBytes(32);
const OP_A = operationIdFor(IDS.bizA, IDS.saleA);
const ROW_A = `${IDS.bizA}|${IDS.saleA}`;

export function setup({ scenario = 'ok', ...storeOpts } = {}, seedOpts = {}) {
  const store = createMemoryStore({ masterKey: MASTER, ...storeOpts });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA, ...seedOpts });
  store.seed({ businessId: IDS.bizB, userId: IDS.userB, saleId: IDS.saleB });
  const provider = createSimulatedProvider({ scenario, delayMs: 15 });
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER, timeoutMs: 200 });
  return { store, provider, emitter };
}

test('emisión feliz: issued con folio, sin reintentos', async () => {
  const { store, provider, emitter } = setup();
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 1000);
  assert.equal(provider.calls, 1);
  const row = store.issuances.get(ROW_A);
  assert.equal(row.status, 'issued');
  assert.ok(row.pdfBase64 && row.xmlBase64);
  assert.ok(store.receipts.has(`${ROW_A}|${OP_A}`), 'el recibo se guarda antes de finalizar');
});

test('concurrencia: 20 emisiones simultáneas -> una sola llamada al proveedor', async () => {
  const { provider, emitter } = setup({ scenario: 'ok' });
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA })),
  );
  assert.equal(provider.calls, 1, 'el proveedor debe llamarse una sola vez');
  const ok = results.filter((r) => r.status === 'fulfilled');
  assert.equal(ok.filter((r) => r.value.status === 'issued').length, 1);
  for (const r of results.filter((x) => x.status === 'rejected')) {
    assert.ok(['ALREADY_IN_PROGRESS', 'NOT_EMITTABLE_IN_STATE'].includes(r.reason.code), r.reason.code);
  }
  for (const r of ok.filter((x) => x.value.status !== 'issued')) {
    assert.equal(r.value.providerCalls, 0);
  }
});

test('idempotencia: una venta ya emitida no vuelve a llamar al proveedor', async () => {
  const { provider, emitter } = setup();
  await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  const again = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(again.alreadyIssued, true);
  assert.equal(again.providerCalls, 0);
  assert.equal(provider.calls, 1);
});

test('rechazo explícito del proveedor -> failed, no se reintenta', async () => {
  const { store, provider, emitter } = setup({ scenario: 'rejected' });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'failed');
  assert.equal(store.issuances.get(ROW_A).status, 'failed');
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'NOT_EMITTABLE_IN_STATE' });
  assert.equal(provider.calls, 1);
});

test('timeout -> unknown; segundo intento bloqueado sin llamar al proveedor', async () => {
  const { store, provider, emitter } = setup({ scenario: 'timeout' });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'unknown');
  assert.equal(r.reason, 'PROVIDER_TIMEOUT');
  assert.equal(store.issuances.get(ROW_A).status, 'unknown');
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  assert.equal(provider.calls, 1);
});

test('error de red -> unknown (nunca failed)', async () => {
  const { store, emitter } = setup({ scenario: 'network' });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'unknown');
  assert.equal(store.issuances.get(ROW_A).status, 'unknown');
});

test('respuesta sin PDF -> unknown, nunca issued', async () => {
  const { store, emitter } = setup({ scenario: 'no_pdf' });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'unknown');
  assert.equal(r.reason, 'INCOMPLETE_DOCUMENT');
  assert.notEqual(store.issuances.get(ROW_A).status, 'issued');
  assert.equal(store.receipts.has(`${ROW_A}|${OP_A}`), false, 'sin documento completo no hay recibo');
});

test('respuesta sin folio -> unknown, nunca issued', async () => {
  const { store, emitter } = setup({ scenario: 'no_folio' });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'unknown');
  assert.equal(store.issuances.get(ROW_A).status, 'unknown');
});

test('tenant: usuario sin rol en el negocio recibe SALE_NOT_FOUND y no cambia nada', async () => {
  const { store, provider, emitter } = setup();
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userB, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
  assert.equal(provider.calls, 0);
  assert.equal(store.issuances.has(ROW_A), false);
});

test('tenant: venta inexistente y venta ajena responden igual (no filtra existencia)', async () => {
  const { emitter } = setup();
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: 'no-existe' }), { code: 'SALE_NOT_FOUND' });
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userB, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
});

test('roles: dueño sin fila de rol activa ya no accede (revocado = no miembro)', async () => {
  const { store, provider, emitter } = setup();
  store.revokeRole(IDS.bizA, IDS.userA, 'fiscal_owner');
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
  assert.equal(provider.calls, 0);
});

test('roles: negocio inactivo bloquea aunque el rol exista', async () => {
  const { store, provider, emitter } = setup({}, { active: false });
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
  assert.equal(provider.calls, 0);
});

test('roles: fiscal_viewer no puede emitir (FISCAL_ROLE_REQUIRED), ni llama al proveedor', async () => {
  const { store, provider, emitter } = setup();
  store.revokeRole(IDS.bizA, IDS.userA, 'fiscal_owner');
  store.grantRole(IDS.bizA, IDS.userA, 'fiscal_viewer');
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'FISCAL_ROLE_REQUIRED' });
  assert.equal(provider.calls, 0);
  assert.equal(store.issuances.has(ROW_A), false);
});

test('roles: fiscal_viewer sí puede reimprimir una venta ya emitida', async () => {
  const { store, emitter } = setup();
  await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  store.revokeRole(IDS.bizA, IDS.userA, 'fiscal_owner');
  store.grantRole(IDS.bizA, IDS.userA, 'fiscal_viewer');
  const r = await emitter.reprint({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.folio, 1000);
});

test('roles: fiscal_operator puede emitir', async () => {
  const { store, provider, emitter } = setup();
  store.revokeRole(IDS.bizA, IDS.userA, 'fiscal_owner');
  store.grantRole(IDS.bizA, IDS.userA, 'fiscal_operator');
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  assert.equal(provider.calls, 1);
});

test('el emisor público no expone reconcile', () => {
  const { emitter } = setup();
  assert.equal('reconcile' in emitter, false);
  assert.deepEqual(Object.keys(emitter).sort(), ['emitSale', 'reprint', 'status']);
  assert.equal(Object.isFrozen(emitter), true);
});

test('el business_id nunca viene del cliente: la operación se deriva de la venta', async () => {
  const { store, emitter } = setup();
  await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(store.issuances.get(ROW_A).operationId, OP_A);
});

test('emisión deshabilitada: rechazo antes de reclamar, cero llamadas', async () => {
  const { store, provider, emitter } = setup({ emissionEnabled: false });
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'FISCAL_EMISSION_DISABLED' });
  assert.equal(provider.calls, 0);
  assert.equal(store.issuances.has(ROW_A), false);
});

test('pago mixto: rechazo sin reclamar', async () => {
  const { store, provider, emitter } = setup({}, {
    cash: true,
    point: { mpStatus: 'processed', mpOrderId: 'o', mpPaymentId: 'p', finalizedAt: new Date(), currency: 'CLP', amount: 2380 },
  });
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'MIXED_PAYMENTS' });
  assert.equal(provider.calls, 0);
  assert.equal(store.issuances.has(ROW_A), false);
});

test('Point confirmada con monto exacto -> emite con medio PE', async () => {
  const { provider, emitter } = setup({}, {
    cash: false,
    point: { mpStatus: 'processed', mpOrderId: 'o', mpPaymentId: 'p', finalizedAt: new Date(), currency: 'CLP', amount: 2380 },
  });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  assert.equal(r.medioPago, 'PE');
  assert.equal(provider.calls, 1);
});

test('proveedor no verificado (bloqueado): rechazo previo al reclamo, la venta sigue sin fila', async () => {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const emitter = createFiscalEmitter({ store, provider: createDtecoreBlockedProvider(), masterKey: MASTER });
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'PROVIDER_NOT_READY' });
  assert.equal(store.issuances.has(ROW_A), false);
});

test('sin credenciales del comercio: se rechaza antes de reclamar', async () => {
  const { store, provider, emitter } = setup();
  store.creds.delete(IDS.bizA);
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'CREDENTIALS_MISSING' });
  assert.equal(provider.calls, 0);
  assert.equal(store.issuances.has(ROW_A), false);
});

test('reimpresión: devuelve el PDF guardado sin llamar al proveedor', async () => {
  const { provider, emitter } = setup();
  await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  const r = await emitter.reprint({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.folio, 1000);
  assert.equal(r.providerCalls, 0);
  assert.equal(provider.calls, 1);
});

test('reimpresión de venta no emitida o de otro tenant: rechazo', async () => {
  const { emitter } = setup();
  await assert.rejects(emitter.reprint({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'NOT_ISSUED' });
  await assert.rejects(emitter.reprint({ actorUserId: IDS.userB, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
});

test('la clave maestra no aparece en el resultado de la emisión', async () => {
  const { emitter } = setup();
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  const dump = JSON.stringify(r);
  assert.equal(dump.includes('TEST-KEY'), false);
  assert.equal(dump.includes(MASTER.toString('base64')), false);
});
