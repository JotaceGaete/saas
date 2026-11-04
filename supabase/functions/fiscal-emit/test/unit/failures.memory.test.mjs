// Fallos entre la respuesta del proveedor y la persistencia del documento, y recuperación de 'sending'.
//
// Reglas que se verifican:
//  - Nunca se reemite. Ningún camino de fallo vuelve a llamar al proveedor (provider.calls === 1).
//  - Nunca se asume que "no existe boleta": sin recibo ni confirmación, la fila queda unknown.
//  - Con recibo guardado, la recuperación finaliza desde el recibo sin llamar al proveedor.
//  - "Caída del proceso" se simula con fault mode 'hang': la llamada nunca vuelve y la fila queda
//    en 'sending' con exactamente el estado que dejaría una caída en ese punto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter, operationIdFor, PERSIST_ATTEMPTS } from '../../lib/emit.mjs';
import { createRecovery, MIN_STALE_AFTER_MS } from '../../lib/recovery.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';
import { TEST_ALLOW_ALL } from '../helpers/allowlist.mjs';

const MASTER = randomBytes(32);
const ROW = `${IDS.bizA}|${IDS.saleA}`;
const OP = operationIdFor(IDS.bizA, IDS.saleA);
const STALE = 11 * 60_000; // por encima del umbral de 10 min usado en world()

function world({ scenario = 'ok', timeoutMs = 200 } = {}) {
  let t = Date.parse('2026-10-31T12:00:00Z');
  const clock = { now: () => new Date(t), advance: (ms) => { t += ms; } };
  const store = createMemoryStore({ masterKey: MASTER, now: clock.now });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const provider = createSimulatedProvider({ scenario, delayMs: 5 });
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider, masterKey: MASTER, timeoutMs });
  const recovery = createRecovery({ store, now: clock.now, staleAfterMs: 10 * 60_000 });
  return { store, provider, emitter, recovery, clock };
}

// Espera a que una condición se cumpla (para llamadas que quedan colgadas a propósito).
async function until(cond, ms = 2000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 2));
  }
}

const emit = (w) => w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });

// ---------------------------------------------------------------------------
// Persistencia parcial tras una respuesta válida del proveedor
// ---------------------------------------------------------------------------

test('recibo no se puede guardar (transporte, reintentos agotados) -> se finaliza igual, sin recibo', async () => {
  const w = world();
  w.store.injectFault('storeReceipt', { mode: 'before', times: 99 });
  const r = await emit(w);
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 1000);
  assert.equal(w.provider.calls, 1);
  assert.equal(w.store.calls.storeReceipt, PERSIST_ATTEMPTS, 'reintentos acotados');
  assert.equal(w.store.receipts.has(`${ROW}|${OP}`), false);
  assert.equal(w.store.issuances.get(ROW).status, 'issued');
});

test('recibo OK, finalizar falla en todos los intentos -> PERSIST_PENDING_RECOVERY; la recuperación finaliza desde el recibo sin proveedor', async () => {
  const w = world();
  w.store.injectFault('finalize', { mode: 'before', times: 99 });
  await assert.rejects(emit(w), { code: 'PERSIST_PENDING_RECOVERY' });
  assert.equal(w.provider.calls, 1);
  assert.equal(w.store.issuances.get(ROW).status, 'sending');
  assert.ok(w.store.receipts.has(`${ROW}|${OP}`), 'el recibo quedó guardado antes del fallo');

  // Antes del umbral no pasa nada.
  assert.equal((await w.recovery.recoverStaleSending()).examined, 0);

  w.clock.advance(STALE);
  w.store.clearFaults();
  const rep = await w.recovery.recoverStaleSending();
  assert.deepEqual(rep, { examined: 1, finalizedFromReceipt: 1, markedUnknown: 0, untouched: 0 });
  const row = w.store.issuances.get(ROW);
  assert.equal(row.status, 'issued');
  assert.equal(row.folio, 1000);
  assert.ok(row.pdfBase64);
  assert.equal(w.provider.calls, 1, 'la recuperación no llama al proveedor');
});

test('tras el fallo, un nuevo emitSale no reemite: responde NOT_EMITTABLE_IN_STATE', async () => {
  const w = world();
  w.store.injectFault('finalize', { mode: 'before', times: 99 });
  await assert.rejects(emit(w), { code: 'PERSIST_PENDING_RECOVERY' });
  w.store.clearFaults();
  await assert.rejects(emit(w), { code: 'NOT_EMITTABLE_IN_STATE' });
  assert.equal(w.provider.calls, 1);
});

test('respuesta de finalizar perdida tras confirmar: el reintento ve issued y no falla', async () => {
  const w = world();
  w.store.injectFault('finalize', { mode: 'after', times: 1 });
  const r = await emit(w);
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 1000);
  assert.equal(w.provider.calls, 1);
  assert.equal(w.store.issuances.get(ROW).status, 'issued');
  assert.equal(w.store.calls.finalize, 2);
});

test('timeout del proveedor y además no se puede escribir unknown -> PERSIST_PENDING_RECOVERY; recuperación lo pasa a unknown', async () => {
  const w = world({ scenario: 'timeout' });
  w.store.injectFault('finalize', { mode: 'before', times: 99 });
  await assert.rejects(emit(w), { code: 'PERSIST_PENDING_RECOVERY' });
  assert.equal(w.store.issuances.get(ROW).status, 'sending');
  w.clock.advance(STALE);
  w.store.clearFaults();
  const rep = await w.recovery.recoverStaleSending();
  assert.equal(rep.markedUnknown, 1);
  assert.equal(w.store.issuances.get(ROW).status, 'unknown');
  assert.equal(w.provider.calls, 1);
});

test('documento con base64 mal formado -> unknown (INCOMPLETE_DOCUMENT); nunca llega al almacén', async () => {
  const w = world();
  const inner = w.provider;
  const malformed = { ready: true, get calls() { return inner.calls; }, async emit(args) {
    const doc = await inner.emit(args);
    return { ...doc, xmlBase64: 'PERTFPgo=' }; // longitud 9: base64 inválido
  } };
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store: w.store, provider: malformed, masterKey: MASTER, timeoutMs: 200 });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'unknown');
  assert.equal(r.reason, 'INCOMPLETE_DOCUMENT');
  assert.equal(w.store.receipts.has(`${ROW}|${OP}`), false);
  assert.equal(w.store.issuances.get(ROW).status, 'unknown');
  assert.equal(malformed.calls, 1);
});

test('conflicto de recibo: ya hay otro recibo para la operación -> unknown, sin elegir uno', async () => {
  const w = world();
  w.store.receipts.set(`${ROW}|${OP}`, {
    businessId: IDS.bizA, saleId: IDS.saleA, operationId: OP, folio: 999, xmlBase64: 'PHhtbA==', pdfBase64: 'JVBERi0xLjQK',
  });
  const r = await emit(w);
  assert.equal(r.status, 'unknown');
  assert.equal(r.reason, 'RECEIPT_CONFLICT');
  const row = w.store.issuances.get(ROW);
  assert.equal(row.status, 'unknown');
  assert.equal(row.folio, null);
  assert.equal(w.provider.calls, 1);
});

// ---------------------------------------------------------------------------
// Caída del proceso (la llamada nunca vuelve)
// ---------------------------------------------------------------------------

test('caída tras la respuesta del proveedor y antes del recibo: recuperación -> unknown; no se reemite', async () => {
  const w = world();
  w.store.injectFault('storeReceipt', { mode: 'hang', times: 1 });
  emit(w); // el proceso "muere" aquí: la promesa nunca se resuelve
  await until(() => w.store.calls.storeReceipt === 1);
  assert.equal(w.provider.calls, 1);
  assert.equal(w.store.issuances.get(ROW).status, 'sending');
  assert.equal(w.store.receipts.has(`${ROW}|${OP}`), false);

  w.clock.advance(STALE);
  const rep = await w.recovery.recoverStaleSending();
  assert.deepEqual(rep, { examined: 1, finalizedFromReceipt: 0, markedUnknown: 1, untouched: 0 });
  const row = w.store.issuances.get(ROW);
  assert.equal(row.status, 'unknown');
  assert.equal(row.folio, null);
  assert.equal(row.errorCode, 'STALE_SENDING');

  await assert.rejects(emit(w), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  assert.equal(w.provider.calls, 1, 'nunca se reemite tras una caída');
});

test('caída tras guardar el recibo y antes de finalizar: la recuperación completa desde el recibo', async () => {
  const w = world();
  w.store.injectFault('finalize', { mode: 'hang', times: 1 });
  emit(w);
  await until(() => w.store.calls.finalize === 1);
  assert.equal(w.store.issuances.get(ROW).status, 'sending');
  assert.ok(w.store.receipts.has(`${ROW}|${OP}`));

  w.clock.advance(STALE);
  const rep = await w.recovery.recoverStaleSending();
  assert.equal(rep.finalizedFromReceipt, 1);
  assert.equal(w.store.issuances.get(ROW).status, 'issued');
  assert.equal(w.provider.calls, 1);
});

test('la recuperación no toca filas recientes', async () => {
  const w = world();
  w.store.injectFault('storeReceipt', { mode: 'hang', times: 1 });
  emit(w);
  await until(() => w.store.calls.storeReceipt === 1);
  const rep = await w.recovery.recoverStaleSending();
  assert.equal(rep.examined, 0);
  assert.equal(w.store.issuances.get(ROW).status, 'sending');
});

test('recuperación repetida es idempotente: la segunda pasada no cambia nada', async () => {
  const w = world();
  w.store.injectFault('finalize', { mode: 'before', times: 99 });
  await assert.rejects(emit(w), { code: 'PERSIST_PENDING_RECOVERY' });
  w.clock.advance(STALE);
  w.store.clearFaults();
  await w.recovery.recoverStaleSending();
  const after1 = { ...w.store.issuances.get(ROW) };
  const rep2 = await w.recovery.recoverStaleSending();
  assert.equal(rep2.examined, 0);
  assert.deepEqual(w.store.issuances.get(ROW), after1);
  assert.equal(w.provider.calls, 1);
});

test('carrera: la recuperación marca unknown mientras el proveedor responde; el emisor no deja una fila issued', async () => {
  let t = Date.parse('2026-10-31T12:00:00Z');
  const now = () => new Date(t);
  const store = createMemoryStore({ masterKey: MASTER, now });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const recovery = createRecovery({ store, now, staleAfterMs: 10 * 60_000 });
  const inner = createSimulatedProvider({ scenario: 'ok', delayMs: 1 });
  // El proveedor responde, pero antes de que el emisor escriba, la recuperación actúa.
  const provider = {
    ready: true,
    get calls() { return inner.calls; },
    async emit(args) {
      const doc = await inner.emit(args);
      t += STALE;
      await recovery.recoverStaleSending();
      return doc;
    },
  };
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider, masterKey: MASTER, timeoutMs: 500 });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'unknown');
  assert.equal(r.reason, 'STATE_CHANGED');
  assert.equal(store.issuances.get(ROW).status, 'unknown');
  assert.equal(store.issuances.get(ROW).folio, null);
  assert.equal(provider.calls, 1);
});

// ---------------------------------------------------------------------------
// Propiedades de la recuperación
// ---------------------------------------------------------------------------

test('la recuperación no acepta proveedor y su API solo expone recoverStaleSending', async () => {
  const w = world();
  const spy = { calls: 0, emit() { this.calls += 1; throw new Error('must not be called'); } };
  const r = createRecovery({ store: w.store, provider: spy, staleAfterMs: 10 * 60_000 });
  assert.deepEqual(Object.keys(r), ['recoverStaleSending']);
  assert.equal(Object.isFrozen(r), true);
  await r.recoverStaleSending();
  assert.equal(spy.calls, 0);
});

test('staleAfterMs por debajo del mínimo se rechaza (evita marcar en vuelo)', () => {
  const store = createMemoryStore({ masterKey: MASTER });
  assert.throws(() => createRecovery({ store, staleAfterMs: 1000 }), /at least/);
  assert.equal(MIN_STALE_AFTER_MS, 5 * 60_000);
  assert.doesNotThrow(() => createRecovery({ store, staleAfterMs: MIN_STALE_AFTER_MS }));
});

test('el almacén nunca marca unknown una fila que ya tiene recibo', async () => {
  const w = world();
  w.store.injectFault('finalize', { mode: 'before', times: 99 });
  await assert.rejects(emit(w), { code: 'PERSIST_PENDING_RECOVERY' });
  w.clock.advance(STALE);
  const changed = await w.store.markStaleUnknown(IDS.bizA, IDS.saleA, OP, new Date(w.clock.now().getTime() - 60_000));
  assert.equal(changed, false);
  assert.equal(w.store.issuances.get(ROW).status, 'sending');
});
