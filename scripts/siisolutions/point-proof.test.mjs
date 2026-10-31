import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPointOrderForFiscal } from '../../api/_lib/siisolutions-point-proof.js';
import { normalizeCrmFiscalSale } from '../../api/_lib/siisolutions-crm-bridge.js';

const invoice = { id: 'sale-1', business_id: 'biz-1', status: 'pagada', total: 5000, currency: 'CLP' };
const operation = {
  business_id: 'biz-1', crm_invoice_id: 'sale-1',
  mp_order_id: 'order-1', mp_payment_id: 'payment-1',
  external_reference: 'ref-1', amount: 5000, currency: 'CLP',
};
const providerOrder = {
  id: 'order-1', payment_id: 'payment-1', external_reference: 'ref-1',
  status: 'processed', payment_status: 'approved', amount: '5000',
};
const run = (op = operation, order = providerOrder, inv = invoice) =>
  verifyPointOrderForFiscal({ invoice: inv, operation: op, providerOrder: order });

test('matching server-fetched Point order yields a bridge-ready proof', () => {
  const verified = run();
  assert.equal(verified.verified, true);
  const bridge = normalizeCrmFiscalSale({
    invoice,
    items: [{ name: 'Producto', unit_price: 5000, quantity: 1, subtotal: 5000 }],
    payments: [{ payment_method: 'mercado_pago', payment_status: 'received', amount: 5000 }],
    verifiedPointPayment: verified.proof,
  });
  assert.equal(bridge.ready, true);
  assert.equal(bridge.payment.provider_payment_id, 'payment-1');
});

test('rejects mismatched tenant, sale, payment, reference and amount', () => {
  for (const change of [
    { business_id: 'other' }, { crm_invoice_id: 'other' },
    { mp_payment_id: 'other' }, { amount: 4000 }, { currency: 'ARS' },
  ]) assert.equal(run({ ...operation, ...change }).verified, false);
  for (const change of [
    { id: 'other' }, { payment_id: 'other' },
    { external_reference: 'other' }, { amount: '4000' },
    { status: 'created' }, { payment_status: 'pending' },
  ]) assert.equal(run(operation, { ...providerOrder, ...change }).verified, false);
  assert.equal(run(operation, providerOrder, { ...invoice, business_id: 'other' }).verified, false);
});
