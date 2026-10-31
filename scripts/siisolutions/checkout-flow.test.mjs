import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareFiscalSale } from '../../api/_lib/siisolutions-checkout-flow.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const saleId = '22222222-2222-4222-8222-222222222222';
const sale = { id: saleId, business_id: businessId, status: 'pagada', total: 15000 };
const base = { sale, businessId, issuerBusinessId: businessId };
const cash = { method: 'cash', business_id: businessId, sale_id: saleId, currency: 'CLP', amount: 15000, received_by_cashier: true, status: 'received' };
const point = { method: 'mercado_pago', business_id: businessId, sale_id: saleId, currency: 'CLP', amount: 15000, provider: 'mercado_pago', channel: 'point', verified_by_server: true, status: 'approved', provider_payment_id: 'mp-123' };

test('cash requires a confirmed cashier receipt', () => {
  assert.equal(prepareFiscalSale({ ...base, payment: cash }).paymentMethod, 'cash');
  assert.equal(prepareFiscalSale({ ...base, payment: { ...cash, received_by_cashier: false } }).ready, false);
});

test('Point requires server verification and approval', () => {
  assert.equal(prepareFiscalSale({ ...base, payment: point }).paymentMethod, 'mercado_pago');
  assert.equal(prepareFiscalSale({ ...base, payment: { ...point, status: 'rejected' } }).ready, false);
  assert.equal(prepareFiscalSale({ ...base, payment: { ...point, verified_by_server: false } }).ready, false);
});

test('unpaid sales and mismatched amounts cannot be invoiced', () => {
  assert.equal(prepareFiscalSale({ ...base, sale: { ...sale, status: 'pendiente' }, payment: cash }).ready, false);
  assert.equal(prepareFiscalSale({ ...base, payment: { ...cash, amount: 1000 } }).ready, false);
  assert.equal(prepareFiscalSale({ ...base, issuerBusinessId: 'other', payment: cash }).ready, false);
});
