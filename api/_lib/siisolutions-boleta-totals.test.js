import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoletaPayload } from './siisolutions-adapter.js';
import { normalizeCrmFiscalSale } from './siisolutions-crm-bridge.js';

const sale = (items, total) => ({
  id: '2d8a4f3c-5e6f-4a71-8c1d-2e3f4a5b6c7d', operatorRut: '12345678-5',
  total, paymentMethod: 'cash', items,
});

test('DTE 39 lines carry IVA-inclusive gross prices and sum exactly to the paid total', () => {
  // 1190 CLP gross = 1000 neto + 190 IVA (19%). Payload must not re-apply IVA.
  const payload = buildBoletaPayload(sale([
    { description: 'Café', unitPrice: 1190, quantity: 1, subtotal: 1190 },
    { description: 'Sello', unitPrice: 500, quantity: 3, subtotal: 1500 },
  ], 2690));
  assert.equal(payload.montoPago, '2690');
  assert.equal(payload.detalles.reduce((s, d) => s + d.precioSubtotal, 0), 2690);
  assert.equal(payload.detalles[0].precio, 1190);
  assert.equal(payload.vuelto, '0');
});

test('line subtotal mismatch (discount) is rejected instead of silently emitted', () => {
  assert.throws(() => buildBoletaPayload(sale([
    { description: 'Café', unitPrice: 1190, quantity: 2, subtotal: 2000 },
  ], 2000)), /Line subtotal mismatch/);
});

test('non-integer CLP amounts are rejected', () => {
  assert.throws(() => buildBoletaPayload(sale([
    { description: 'Café', unitPrice: 1190.5, quantity: 1, subtotal: 1190.5 },
  ], 1190.5)), /Invalid unitPrice/);
});

test('payment method mapping: cash -> EF, Mercado Pago -> PE', () => {
  const base = [{ description: 'X', unitPrice: 100, quantity: 1, subtotal: 100 }];
  assert.equal(buildBoletaPayload({ ...sale(base, 100), paymentMethod: 'cash' }).medioPago, 'EF');
  assert.equal(buildBoletaPayload({ ...sale(base, 100), paymentMethod: 'mercado_pago' }).medioPago, 'PE');
});

test('CRM mapper refuses sales whose invoice total differs from received payments', () => {
  const result = normalizeCrmFiscalSale({
    invoice: { id: 'i1', business_id: 'b1', status: 'pagada', total: 1000, currency: 'CLP' },
    items: [{ name: 'A', unit_price: 1000, quantity: 1, subtotal: 1000 }],
    payments: [{ payment_status: 'received', payment_method: 'cash', amount: 900 }],
  });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'PAYMENT_TOTAL_MISMATCH');
});
