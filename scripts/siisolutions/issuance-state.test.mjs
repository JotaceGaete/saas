import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFiscalState, maySendToProvider, reconcileProviderOutcome, operationIdForSale } from '../../api/_lib/siisolutions-issuance-state.js';

test('only pending issuances can be sent', () => {
  assert.equal(maySendToProvider('pending'), true);
  for (const state of ['sending','unknown','issued','failed','cancelled']) assert.equal(maySendToProvider(state), false);
});
test('unknown outcomes cannot be sent again', () => {
  assert.equal(nextFiscalState('sending','unknown'), 'unknown');
  assert.throws(() => nextFiscalState('unknown','sending'), /Invalid/);
  assert.throws(() => nextFiscalState('issued','sending'), /Invalid/);
});
test('network timeouts require reconciliation', () => {
  assert.deepEqual(reconcileProviderOutcome({networkError:true}), {state:'unknown',requiresManualReconciliation:true});
});
test('documented folio and XML mark an issuance as issued', () => {
  const result = reconcileProviderOutcome({statusCode:200,response:{folio:1042,xmlBase64:'eG1s'}});
  assert.equal(result.state,'issued');
  assert.equal(result.folio,1042);
});
test('operation id includes tenant and sale', () => {
  const a='11111111-1111-4111-8111-111111111111';
  const b='22222222-2222-4222-8222-222222222222';
  assert.equal(operationIdForSale(a,b), 'WLK-'+a+'-'+b);
});
