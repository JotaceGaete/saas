import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCrmFiscalSale } from '../../api/_lib/siisolutions-crm-bridge.js';

const invoice = { id: 'sale-1', business_id: 'business-1', status: 'pagada', currency: 'CLP', total: 5000 };
const items = [{ name: 'Servicio', unit_price: 5000, quantity: 1, subtotal: 5000 }];
const payments = [{ payment_method: 'cash', payment_status: 'received', amount: 5000, voided_at: null }];
const normalize = (patch = {}) => normalizeCrmFiscalSale({ invoice, items, payments, ...patch });

test('paid cash sale maps without granting cashier authorization', () => {
  const result = normalize();
  assert.equal(result.ready, true);
  assert.equal(result.payment.received_by_cashier, false);
  assert.equal(result.requiresCashierVerification, true);
  assert.equal(result.sale.items[0].unitPrice, 5000);
});

test('voided or unpaid invoices cannot proceed', () => {
  assert.equal(normalize({ invoice: { ...invoice, status: 'anulada' } }).reason, 'INVOICE_VOIDED');
  assert.equal(normalize({ invoice: { ...invoice, status: 'pendiente' } }).reason, 'INVOICE_NOT_PAID');
});

test('Point payment requires independent provider verification', () => {
  assert.equal(normalize({ payments: [{ ...payments[0], payment_method: 'mercado_pago' }] }).reason, 'PAYMENT_VERIFICATION_REQUIRED');
});

test('mixed tender and discounts fail closed', () => {
  assert.equal(normalize({ payments: [
    { ...payments[0], amount: 3000 },
    { ...payments[0], amount: 2000 },
  ] }).reason, 'MIXED_PAYMENTS_UNSUPPORTED');
  assert.equal(normalize({ items: [{ ...items[0], subtotal: 4500 }] }).reason, 'DISCOUNT_OR_ITEM_MISMATCH');
});

test('voided payment and amount mismatches are rejected', () => {
  assert.equal(normalize({ payments: [{ ...payments[0], voided_at: '2026-10-29T10:00:00Z' }] }).reason, 'PAYMENT_TOTAL_MISMATCH');
  assert.equal(normalize({ payments: [{ ...payments[0], amount: 4000 }] }).reason, 'PAYMENT_TOTAL_MISMATCH');
});
