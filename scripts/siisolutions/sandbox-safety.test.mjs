import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendBoletaSimulation } from '../../api/_lib/siisolutions-adapter.js';

const sale = {
  id: 'TEST-1', operatorRut: '76509283-3', total: 5950,
  paymentMethod: 'cash',
  items: [{ description: 'Producto', unitPrice: 5950, quantity: 1, subtotal: 5950 }],
};

test('simulation never sends to production URL', async () => {
  const prior = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  let called = false;
  try {
    await assert.rejects(
      () => sendBoletaSimulation({
        sale, apiKey: 'dummy', sandboxBaseUrl: 'https://api.siisolutions.cl',
        fetchImpl: async () => { called = true; throw new Error('unexpected'); },
      }),
      /sandbox URL required/,
    );
    assert.equal(called, false);
  } finally {
    if (prior === undefined) delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
    else process.env.SIISOLUTIONS_EMISSION_ENABLED = prior;
  }
});
