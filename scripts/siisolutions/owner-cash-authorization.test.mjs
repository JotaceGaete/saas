import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerCashFiscalAuthorization } from '../../api/_lib/siisolutions-owner-cash-authorization.js';

const businessId = 'biz-1', invoiceId = 'sale-1', actorId = 'owner-1';
const payment = {
  business_id: businessId, invoice_id: invoiceId, created_by: actorId,
  payment_method: 'cash', payment_status: 'received', voided_at: null,
};
function admin(owner = actorId) {
  return { from(table) {
    assert.equal(table, 'wa_businesses');
    const query = {
      eq() { return query; },
      maybeSingle: async () => ({ data: { id: businessId, user_id: owner }, error: null }),
    };
    return { select: () => query };
  } };
}
test('only business owner can authorize manual cash', async () => {
  const authorize = createOwnerCashFiscalAuthorization(admin());
  assert.equal(await authorize({ businessId, invoiceId, actorId }), true);
  assert.equal(await authorize({ businessId, invoiceId, actorId: 'stranger' }), false);
});
test('receipt must be recorded by same owner for same sale and business', async () => {
  const authorize = createOwnerCashFiscalAuthorization(admin());
  const args = { businessId, invoiceId, actorId, verifyReceipt: true };
  assert.equal(await authorize({ ...args, payment }), true);
  assert.equal(await authorize({ ...args, payment: { ...payment, created_by: 'other' } }), false);
  assert.equal(await authorize({ ...args, payment: { ...payment, invoice_id: 'other' } }), false);
  assert.equal(await authorize({ ...args, payment: { ...payment, voided_at: '2026-10-30' } }), false);
  assert.equal(await authorize({ ...args, payment: { ...payment, payment_status: 'pending' } }), false);
});
