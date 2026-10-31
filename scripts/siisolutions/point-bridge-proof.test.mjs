import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCrmFiscalSale } from '../../api/_lib/siisolutions-crm-bridge.js';

const invoice = { id: 'sale-1', business_id: 'biz-1', status: 'pagada', currency: 'CLP', total: 5000 };
const items = [{ name: 'Producto', unit_price: 5000, quantity: 1, subtotal: 5000 }];
const payments = [{ payment_method: 'mercado_pago', payment_status: 'received', amount: 5000 }];
const proof = { verified_by_server: true, provider: 'mercado_pago', channel: 'point', status: 'approved', provider_payment_id: 'mp-1', business_id: 'biz-1', sale_id: 'sale-1', amount: 5000, currency: 'CLP' };

test('Point proof must match sale, business, amount and provider status', () => {
  const run = (verifiedPointPayment) => normalizeCrmFiscalSale({ invoice, items, payments, verifiedPointPayment });
  assert.equal(run(proof).ready, true);
  assert.equal(run(proof).payment.method, 'mercado_pago');
  assert.equal(run(null).reason, 'PAYMENT_VERIFICATION_REQUIRED');
  for (const change of [{ business_id: 'other' }, { sale_id: 'other' }, { amount: 4999 }, { status: 'pending' }, { verified_by_server: false }]) {
    assert.equal(run({ ...proof, ...change }).reason, 'PAYMENT_VERIFICATION_REQUIRED');
  }
});
