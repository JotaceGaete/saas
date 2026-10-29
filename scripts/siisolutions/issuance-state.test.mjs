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
test('folio, XML and PDF mark an issuance as issued', () => {
  const result = reconcileProviderOutcome({statusCode:200,response:{folio:1042,xmlBase64:'eG1s',pdfBase64:'cGRm'}});
  assert.equal(result.state,'issued');
  assert.equal(result.folio,1042);
});
test('operation id includes tenant and sale', () => {
  const a='11111111-1111-4111-8111-111111111111';
  const b='22222222-2222-4222-8222-222222222222';
  assert.equal(operationIdForSale(a,b), 'WLK-'+a+'-'+b);
});

test('409 duplicate operation remains unknown but exposes existing folio for reconciliation', () => {
  const result = reconcileProviderOutcome({statusCode:409,response:{success:false,folioExistente:1234}});
  assert.equal(result.state, 'unknown');
  assert.equal(result.requiresManualReconciliation, true);
  assert.equal(result.existingFolio, 1234);
  assert.equal(result.reason, 'PROVIDER_OPERATION_ALREADY_EXISTS');
});

test('missing PDF is unknown and must never be retried automatically', () => {
  const result = reconcileProviderOutcome({statusCode:200,response:{folio:1042,xmlBase64:'eG1s'}});
  assert.equal(result.state,'unknown');
  assert.equal(result.requiresManualReconciliation,true);
});
