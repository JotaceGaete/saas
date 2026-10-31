import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFiscalPointOrder, createFiscalPointOrderFetcher,
  createFiscalPointConnectionLoader,
} from '../../api/_lib/siisolutions-point-provider.js';

const raw = {
  id: 'order-1', external_reference: 'ref-1', status: 'processed',
  transactions: { payments: [{ id: 'payment-1', status: 'approved', amount: '1000' }] },
};

test('provider order fetcher authenticates with business OAuth and sanitizes response', async () => {
  let url, token;
  const fetcher = createFiscalPointOrderFetcher({
    loadConnection: async ({ businessId }) => {
      assert.equal(businessId, 'biz-1');
      return { access_token: 'secret-token' };
    },
    fetchImpl: async (u, options) => {
      url = u; token = options.headers.Authorization;
      return { ok: true, json: async () => raw };
    },
  });
  const order = await fetcher({ businessId: 'biz-1', orderId: 'order-1' });
  assert.equal(url, 'https://api.mercadopago.com/v1/orders/order-1');
  assert.equal(token, 'Bearer secret-token');
  assert.equal(order.payment_status, 'approved');
  assert.equal(order.payment_id, 'payment-1');
});

test('multiple Point payments are ambiguous and rejected', () => {
  assert.equal(sanitizeFiscalPointOrder({
    ...raw, transactions: { payments: [
      { id: 'one', status: 'approved', amount: '1000' },
      { id: 'two', status: 'approved', amount: '1000' },
    ] },
  }), null);
});

test('mismatched provider order ID is rejected', async () => {
  const fetcher = createFiscalPointOrderFetcher({
    loadConnection: async () => ({ access_token: 'token' }),
    fetchImpl: async () => ({ ok: true, json: async () => ({ ...raw, id: 'other' }) }),
  });
  await assert.rejects(fetcher({ businessId: 'biz-1', orderId: 'order-1' }));
});

test('connection loader requires exactly one business-scoped OAuth connection', async () => {
  const admin = { rpc: async (name, params) => {
    assert.equal(name, 'wa_get_mp_point_connection');
    assert.equal(params.p_business_id, 'biz-1');
    return { data: [{ access_token: 'secret' }], error: null };
  } };
  const loader = createFiscalPointConnectionLoader(admin);
  assert.deepEqual(await loader({ businessId: 'biz-1' }), { access_token: 'secret' });
});
