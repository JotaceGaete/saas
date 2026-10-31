import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualCashFiscalHttpHandler } from '../../api/_lib/siisolutions-manual-http.js';

const uuid = '11111111-1111-4111-8111-111111111111';
function res() {
  return {
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
test('manual fiscal HTTP adapter rejects non-POST and malformed invoice identity', async () => {
  let calls = 0;
  const handle = createManualCashFiscalHttpHandler({
    authenticate: async () => uuid,
    issueManualCash: async () => { calls++; return { state: 'issued' }; },
  });
  const get = res();
  await handle({ method: 'GET', headers: {} }, get);
  assert.equal(get.code, 405);
  const bad = res();
  await handle({ method: 'POST', headers: { authorization: 'Bearer validtoken' }, body: { businessId: uuid, invoiceId: 'wrong' } }, bad);
  assert.equal(bad.code, 400);
  assert.equal(calls, 0);
});
test('manual fiscal HTTP adapter returns conflict without repeating claimed operation', async () => {
  let calls = 0;
  const handle = createManualCashFiscalHttpHandler({
    authenticate: async () => uuid,
    issueManualCash: async () => { calls++; return { state: 'already_claimed' }; },
  });
  const response = res();
  await handle({ method: 'POST', headers: { authorization: 'Bearer validtoken' }, body: { businessId: uuid, invoiceId: uuid } }, response);
  assert.equal(response.code, 409);
  assert.equal(calls, 1);
});
