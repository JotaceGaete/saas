import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRecovery, MIN_STALE_AFTER_MS } from '../../lib/recovery.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';

const T0 = new Date('2026-11-02T12:00:00Z');
const OLD = new Date(T0.getTime() - 20 * 60_000);
const OP = 'WLK-biz-a-sale-a';

function fixture() {
  const store = createMemoryStore({ masterKey: randomBytes(32), now: () => OLD });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  return store;
}

test('recuperación con recibo: finaliza issued, idempotente y sin proveedor', async () => {
  const store = fixture();
  assert.equal(await store.claim(IDS.bizA, IDS.saleA, OP), true);
  await store.storeReceipt(IDS.bizA, IDS.saleA, OP, {
    folio: 51105, xmlBase64: 'eG1s', pdfBase64: 'cGRm',
  });
  const recovery = createRecovery({ store, now: () => T0 });
  assert.deepEqual(await recovery.recoverStaleSending(), {
    examined: 1, remainingCandidates: 0, finalizedFromReceipt: 1, markedUnknown: 0, untouched: 0,
  });
  assert.equal((await store.getIssuance(IDS.bizA, IDS.saleA)).status, 'issued');
  assert.equal((await store.getIssuance(IDS.bizA, IDS.saleA)).folio, 51105);
  assert.equal((await recovery.recoverStaleSending()).examined, 0);
});

test('recuperación sin recibo: unknown, nunca pending ni reemisión', async () => {
  const store = fixture();
  await store.claim(IDS.bizA, IDS.saleA, OP);
  const recovery = createRecovery({ store, now: () => T0 });
  const report = await recovery.recoverStaleSending();
  assert.equal(report.markedUnknown, 1);
  assert.equal((await store.getIssuance(IDS.bizA, IDS.saleA)).status, 'unknown');
  assert.equal(await store.claim(IDS.bizA, IDS.saleA, OP), false);
  assert.equal((await recovery.recoverStaleSending()).examined, 0);
});

test('recuperación respeta ventana mínima y no toca emisiones recientes', async () => {
  const store = fixture();
  await store.claim(IDS.bizA, IDS.saleA, OP);
  assert.throws(() => createRecovery({ store, staleAfterMs: MIN_STALE_AFTER_MS - 1 }));
  const recovery = createRecovery({ store, now: () => OLD });
  assert.equal((await recovery.recoverStaleSending()).examined, 0);
  assert.equal((await store.getIssuance(IDS.bizA, IDS.saleA)).status, 'sending');
});

test('límite por lote impide procesar más filas de las autorizadas', async () => {
  const calls = [];
  const rows = Array.from({ length: 4 }, (_, i) => ({
    businessId: 'b', saleId: String(i), operationId: 'op',
  }));
  const store = {
    listStaleSending: async () => rows,
    finalizeFromReceipt: async (_b, saleId) => { calls.push(saleId); return true; },
    markStaleUnknown: async () => { throw new Error('unexpected'); },
  };
  const recovery = createRecovery({ store, now: () => T0, maxRows: 2 });
  const report = await recovery.recoverStaleSending();
  assert.equal(report.examined, 2);
  assert.equal(report.remainingCandidates, 2);
  assert.deepEqual(calls, ['0', '1']);
  assert.throws(() => createRecovery({ store, maxRows: 0 }));
  assert.throws(() => createRecovery({ store, maxRows: 1001 }));
});
