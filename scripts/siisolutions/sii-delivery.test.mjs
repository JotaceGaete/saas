import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDteCoreDelivery } from '../../api/_lib/siisolutions-sii-delivery.js';

test('flags observed -11 processing error without reissuing', () => {
  const result = classifyDteCoreDelivery({
    folio: 51105, trackId: '24407374877',
    deliveryCode: -11, errorCode: 2, message: 'Error de Proceso',
  });
  assert.equal(result.state, 'requires_review');
  assert.equal(result.retryIssuance, false);
  assert.equal(result.folio, 51105);
});
test('track ID alone does not mean accepted', () => {
  assert.equal(classifyDteCoreDelivery({ folio: 51105, trackId: '24407374877' }).state, 'unverified');
});
test('missing folio cannot authorize retry', () => {
  assert.equal(classifyDteCoreDelivery({}).retryIssuance, false);
});
