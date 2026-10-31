import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueVerifiedPointBoleta } from '../../api/_lib/siisolutions-point-checkout.js';

const invoice = { id: 'sale-1', business_id: 'biz-1', status: 'pagada', total: 5000, currency: 'CLP' };
const operation = {
  business_id: 'biz-1', crm_invoice_id: 'sale-1', mp_order_id: 'order-1',
  mp_payment_id: 'payment-1', external_reference: 'ref-1',
  amount: 5000, currency: 'CLP',
};
const providerOrder = {
  id: 'order-1', payment_id: 'payment-1', external_reference: 'ref-1',
  status: 'processed', payment_status: 'approved', amount: '5000',
};
const records = {
  invoice, operation,
  items: [{ name: 'Producto', unit_price: 5000, quantity: 1, subtotal: 5000 }],
  payments: [{ payment_method: 'mercado_pago', payment_status: 'received', amount: 5000 }],
};
const run = (overrides = {}) => issueVerifiedPointBoleta({
  invoiceId: 'sale-1', businessId: 'biz-1',
  loadPersisted: async () => records,
  fetchProviderOrder: async () => providerOrder,
  issuerBusinessId: 'biz-1',
  ...overrides,
});

test('server-loaded Point sale blocks before fiscal call when payment is pending', async () => {
  const result = await run({
    fetchProviderOrder: async () => ({ ...providerOrder, payment_status: 'pending' }),
  });
  assert.equal(result.state, 'blocked');
  assert.equal(result.reason, 'PROVIDER_PAYMENT_NOT_APPROVED');
});

test('server-loaded Point sale rejects cross-business operation before provider fetch', async () => {
  let fetched = false;
  const result = await run({
    loadPersisted: async () => ({ ...records, operation: { ...operation, business_id: 'other' } }),
    fetchProviderOrder: async () => { fetched = true; return providerOrder; },
  });
  assert.equal(result.reason, 'PERSISTED_SALE_MISMATCH');
  assert.equal(fetched, false);
});

test('valid Point sale reaches fiscal sandbox gate, never emits without configuration', async () => {
  const previous = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'disabled';
  let sent = false;
  try {
    const result = await run({ fetchImpl: async () => { sent = true; throw Error('unexpected'); } });
    assert.equal(result.reason, 'SANDBOX_NOT_CONFIGURED');
    assert.equal(sent, false);
  } finally {
    if (previous === undefined) delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
    else process.env.SIISOLUTIONS_EMISSION_ENABLED = previous;
  }
});
