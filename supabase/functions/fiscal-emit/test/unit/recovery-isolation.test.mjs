// La recuperación procesa cada fila por separado: el error de un comercio no detiene a los demás.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecovery } from '../../lib/recovery.mjs';

test('recuperación: una fila con conflicto no detiene la recuperación de otros comercios', async () => {
  const done = [];
  const store = {
    async listStaleSending() {
      return [
        { businessId: 'A', saleId: 'a1', operationId: 'op-a1' },
        { businessId: 'B', saleId: 'b1', operationId: 'op-b1' },
      ];
    },
    async finalizeFromReceipt(b) {
      if (b === 'A') throw Object.assign(new Error('FISCAL_FOLIO_DUPLICATE'), { code: 'FISCAL_FOLIO_DUPLICATE' });
      return false;
    },
    async markStaleUnknown(b) { done.push(b); return true; },
  };
  const r = await createRecovery({ store }).recoverStaleSending();
  assert.deepEqual(done, ['B']);
  assert.equal(r.errors, 1);
  assert.equal(r.markedUnknown, 1);
});
