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
