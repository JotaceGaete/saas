import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPointBoletaEligibility } from '../../api/_lib/siisolutions-sale-eligibility.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const sale = { id: '22222222-2222-4222-8222-222222222222', business_id: businessId, status: 'pagada', total: 59500 };
const payment = { business_id: businessId, sale_id: sale.id, provider: 'mercado_pago', channel: 'point', verified_by_server: true, status: 'approved', provider_payment_id: 'mp-1', amount: 59500, currency: 'CLP' };
const input = { sale, payment, businessId, issuerBusinessId: businessId };

test('allows only verified approved Point payment for the correct business', () => {
  assert.equal(assessPointBoletaEligibility(input).eligible, true);
});
test('rejects unverified, failed, mismatched and foreign payments', () => {
  for (const change of [
    { verified_by_server: false },
    { status: 'rejected' },
    { amount: 1 },
    { sale_id: 'foreign-sale' },
    { business_id: 'foreign-business' },
    { channel: 'checkout' },
  ]) {
    assert.equal(assessPointBoletaEligibility({ ...input, payment: { ...payment, ...change } }).eligible, false);
  }
  assert.equal(assessPointBoletaEligibility({ ...input, issuerBusinessId: 'other' }).eligible, false);
});
