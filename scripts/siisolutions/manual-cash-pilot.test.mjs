import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualCashFiscalPilot } from '../../api/_lib/siisolutions-manual-cash-pilot.js';

const invoiceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const businessId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
function admin() {
  let reads = 0;
  return {
    get reads() { return reads; },
    from() {
      reads++;
      throw new Error('Database must not be read before authorization');
    },
    rpc() { throw new Error('Fiscal RPC must not be invoked'); },
  };
}
test('manual cash requires trusted service-role client and cashier verifier', () => {
  assert.throws(() => createManualCashFiscalPilot({ admin: null }));
  assert.throws(() => createManualCashFiscalPilot({
    admin: admin(), resolveIssuer: async () => ({}),
  }));
});
test('missing actor identity blocks before issuer or database access', async () => {
  const db = admin();
  const pilot = createManualCashFiscalPilot({
    admin: db,
    resolveIssuer: async () => { throw Error('Unexpected issuer read'); },
    authorizeCashier: async () => { throw Error('Unexpected cashier check'); },
  });
  assert.deepEqual(await pilot({ businessId, invoiceId }), {
    state: 'blocked', reason: 'IDENTITY_REQUIRED',
  });
  assert.equal(db.reads, 0);
});
test('unverified issuer blocks before reading sale', async () => {
  const db = admin();
  const pilot = createManualCashFiscalPilot({
    admin: db, resolveIssuer: async () => ({ businessId: 'another-business', authorized: true }),
    authorizeCashier: async () => true,
  });
  assert.deepEqual(await pilot({ businessId, invoiceId, actorId }), {
    state: 'blocked', reason: 'ISSUER_NOT_AUTHORIZED',
  });
  assert.equal(db.reads, 0);
});
test('unauthorized cashier blocks before loading sale or claiming issuance', async () => {
  const db = admin();
  const pilot = createManualCashFiscalPilot({
    admin: db,
    resolveIssuer: async () => ({
      businessId, authorized: true, operatorRut: '12345678-5', apiKey: 'test-key',
    }),
    authorizeCashier: async () => false,
  });
  assert.deepEqual(await pilot({ businessId, invoiceId, actorId }), {
    state: 'blocked', reason: 'CASHIER_NOT_AUTHORIZED',
  });
  assert.equal(db.reads, 0);
});

test('voided historical payment is ignored and the active cash receipt is verified', async () => {
  const voided = {
    id: 'old', invoice_id: invoiceId, business_id: businessId,
    created_by: actorId, payment_method: 'cash', payment_status: 'received',
    amount: 1000, voided_at: '2026-10-29T12:00:00Z',
  };
  const current = {
    id: 'current', invoice_id: invoiceId, business_id: businessId,
    created_by: actorId, payment_method: 'cash', payment_status: 'received',
    amount: 1000, voided_at: null,
  };
  const records = {
    crm_invoices: { data: { id: invoiceId, business_id: businessId, status: 'pagada', total: 1000 }, error: null },
    wa_businesses: { data: { id: businessId, country_code: 'CL', currency: 'CLP' }, error: null },
    crm_invoice_items: { data: [{ name: 'Producto', unit_price: 1000, quantity: 1, subtotal: 1000 }], error: null },
    crm_payments: { data: [voided, current], error: null },
  };
  const verified = [];
  const db = {
    from(table) {
      const result = records[table];
      if (!result) throw Error('Unexpected table: ' + table);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle: async () => result,
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return chain;
    },
    rpc() { throw Error('Fiscal RPC must not be invoked'); },
  };
  const pilot = createManualCashFiscalPilot({
    admin: db,
    resolveIssuer: async () => ({
      businessId, authorized: true, operatorRut: '12345678-5', apiKey: 'test-key',
    }),
    authorizeCashier: async ({ verifyReceipt, payment }) => {
      if (!verifyReceipt) return true;
      verified.push(payment);
      return false;
    },
  });
  assert.deepEqual(await pilot({ businessId, invoiceId, actorId }), {
    state: 'blocked', reason: 'CASH_RECEIPT_NOT_VERIFIED',
  });
  assert.equal(verified.length, 1);
  assert.equal(verified[0].id, 'current');
});
