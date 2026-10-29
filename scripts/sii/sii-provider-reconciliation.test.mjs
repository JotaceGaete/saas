import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyProviderResponse } = require('./sii-provider-reconciliation.cjs');
test('provider submission never means SII acceptance', () => {
  assert.deepEqual(classifyProviderResponse({status:'submitted',response:{success:true,folio:51105}}),
    {status:'submitted',folio:51105,reason:'SII_ACCEPTANCE_NOT_CONFIRMED'});
});
test('duplicate folio needs reconciliation, never automatic resend', () => {
  assert.deepEqual(classifyProviderResponse({status:'already_issued',folio:51104,response:{folioExistente:51104}}),
    {status:'unknown',folio:51104,reason:'EXISTING_FOLIO_REQUIRES_RECONCILIATION'});
});
test('ambiguous, missing and error results fail closed', () => {
  assert.equal(classifyProviderResponse(null).status,'unknown');
  assert.equal(classifyProviderResponse({status:'submitted',response:{success:false}}).status,'unknown');
  assert.equal(classifyProviderResponse({status:'submitted',response:{success:true,folio:'invalid'}}).folio,null);
});
