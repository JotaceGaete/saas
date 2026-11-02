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
    examined: 1, finalizedFromReceipt: 1, markedUnknown: 0, untouched: 0,
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
