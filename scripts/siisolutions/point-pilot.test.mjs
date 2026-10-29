import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPointFiscalPilot } from '../../api/_lib/siisolutions-point-pilot.js';

const invoice = { id: 'sale-1', business_id: 'biz-1', status: 'pagada', total: 1000, currency: 'CLP' };
const op = {
  business_id: 'biz-1', crm_invoice_id: 'sale-1', mp_order_id: 'order-1',
  mp_payment_id: 'payment-1', external_reference: 'ref-1', amount: 1000, currency: 'CLP',
};
const order = {
  id: 'order-1', external_reference: 'ref-1', status: 'processed',
  transactions: { payments: [{ id: 'payment-1', status: 'approved', amount: '1000' }] },
};

function admin() {
  return {
    from(table) {
      const rows = {
        crm_invoices: invoice,
        wa_businesses: { id: 'biz-1', currency: 'CLP', country_code: 'CL' },
        crm_invoice_items: [{ name: 'Producto', unit_price: 1000, quantity: 1, subtotal: 1000 }],
        crm_payments: [{ payment_method: 'mercado_pago', payment_status: 'received', amount: 1000 }],
        crm_pos_point_operations: [op],
      };
      const query = {
        eq() { return query; },
        maybeSingle: async () => ({ data: rows[table], error: null }),
        limit: async () => ({ data: rows[table], error: null }),
        then(resolve, reject) { return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject); },
      };
      return { select: () => query };
    },
    async rpc(name) {
      if (name === 'wa_get_mp_point_connection') return { data: [{ access_token: 'private-token' }], error: null };
      throw new Error('Fiscal claim must not occur while disabled');
    },
  };
}

test('composed Point pilot checks provider then blocks disabled fiscal emission', async () => {
  const previous = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'disabled';
  const urls = [];
  try {
    const pilot = createPointFiscalPilot({
      admin: admin(), resolveIssuer: async ({ businessId }) => ({ businessId, authorized: true, operatorRut: '12345678-5', apiKey: 'private-key' }),
      sandboxBaseUrl: 'https://sandbox.example.org',
      fetchImpl: async (url, opts) => {
        urls.push(url);
        assert.equal(opts.headers.Authorization, 'Bearer private-token');
        return { ok: true, json: async () => order };
      },
    });
    const result = await pilot({ businessId: 'biz-1', invoiceId: 'sale-1' });
    assert.equal(result.state, 'blocked');
    assert.equal(result.reason, 'SANDBOX_NOT_CONFIGURED');
    assert.deepEqual(urls, ['https://api.mercadopago.com/v1/orders/order-1']);
  } finally {
    if (previous === undefined) delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
    else process.env.SIISOLUTIONS_EMISSION_ENABLED = previous;
  }
});

test('composition refuses missing service-role client', () => {
  assert.throws(() => createPointFiscalPilot({ admin: null }));
});

test('composition blocks issuer credentials belonging to another business', async () => {
  let queried = false;
  const pilot = createPointFiscalPilot({
    admin: admin(),
    resolveIssuer: async () => ({
      businessId: 'another-business', authorized: true,
      operatorRut: '12345678-5', apiKey: 'private-key',
    }),
    fetchImpl: async () => { queried = true; throw Error('unexpected'); },
  });
  const result = await pilot({ businessId: 'biz-1', invoiceId: 'sale-1' });
  assert.equal(result.reason, 'ISSUER_NOT_AUTHORIZED');
  assert.equal(queried, false);
});

test('composition refuses missing fiscal issuer resolver', () => {
  assert.throws(() => createPointFiscalPilot({ admin: admin() }));
});
