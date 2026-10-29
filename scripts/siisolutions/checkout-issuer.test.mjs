import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueCheckoutBoleta } from '../../api/_lib/siisolutions-checkout-issuer.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const saleId = '22222222-2222-4222-8222-222222222222';
const sale = { id: saleId, business_id: businessId, status: 'pagada', total: 5950, items: [{ description: 'Producto', unitPrice: 5950, quantity: 1, subtotal: 5950 }] };
const cash = { business_id: businessId, sale_id: saleId, method: 'cash', amount: 5950, currency: 'CLP', status: 'received', received_by_cashier: true };
const point = { ...cash, method: 'mercado_pago', provider: 'mercado_pago', channel: 'point', status: 'approved', verified_by_server: true, provider_payment_id: 'mp123' };
const common = { sale, businessId, issuerBusinessId: businessId, operatorRut: '76509283-3', apiKey: 'fake', sandboxBaseUrl: 'https://sandbox.example.invalid' };

test('cash and Point both blocked without sandbox enablement', async () => {
  const old = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
  try {
    for (const payment of [cash, point]) {
      const result = await issueCheckoutBoleta({ ...common, payment });
      assert.equal(result.reason, 'SANDBOX_NOT_CONFIGURED');
    }
  } finally {
    if (old !== undefined) process.env.SIISOLUTIONS_EMISSION_ENABLED = old;
  }
});

test('cash and Point both use same fiscal claim, without a second charge', async () => {
  const old = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  try {
    for (const payment of [cash, point]) {
      let calls = 0;
      const result = await issueCheckoutBoleta({
        ...common, payment,
        repository: { claimPending: async () => false, finalize: async () => { throw Error('unexpected'); } },
        fetchImpl: async () => { calls++; throw Error('unexpected'); },
      });
      assert.equal(result.state, 'already_claimed');
      assert.equal(calls, 0);
    }
  } finally {
    if (old === undefined) delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
    else process.env.SIISOLUTIONS_EMISSION_ENABLED = old;
  }
});
