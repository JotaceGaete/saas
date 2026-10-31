import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualCashFiscalHttpHandler } from '../../api/_lib/siisolutions-manual-http.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const invoiceId = '33333333-3333-4333-8333-333333333333';
function response() {
  return {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.code = n; return this; },
    json(value) { this.body = value; return this; },
  };
}
test('manual HTTP handler rejects missing bearer before issuer invocation', async () => {
  const handler = createManualCashFiscalHttpHandler({
    authenticate: async () => actorId,
    issueManualCash: async () => { throw Error('Must not issue'); },
  });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { businessId, invoiceId } }, res);
  assert.equal(res.code, 401);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('manual HTTP handler uses verified identity, never request actorId', async () => {
  let issued;
  const handler = createManualCashFiscalHttpHandler({
    authenticate: async token => { assert.equal(token, 'testtoken'); return actorId; },
    issueManualCash: async args => { issued = args; return { state: 'unknown', folio: 123 }; },
  });
  const res = response();
  await handler({
    method: 'POST', headers: { authorization: 'Bearer testtoken' },
    body: { businessId, invoiceId, actorId: 'attacker' },
  }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(issued, { actorId, businessId, invoiceId });
  assert.deepEqual(res.body, { state: 'unknown', folio: 123, reason: null });
});
test('manual HTTP handler does not retry when issuer outcome is ambiguous', async () => {
  let calls = 0;
  const handler = createManualCashFiscalHttpHandler({
    authenticate: async () => actorId,
    issueManualCash: async () => { calls++; throw Error('Provider timeout'); },
  });
  const res = response();
  await handler({
    method: 'POST', headers: { authorization: 'Bearer testtoken' },
    body: { businessId, invoiceId },
  }, res);
  assert.equal(res.code, 503);
  assert.equal(calls, 1);
  assert.equal(res.body.error, 'ISSUANCE_OUTCOME_REQUIRES_REVIEW');
});
