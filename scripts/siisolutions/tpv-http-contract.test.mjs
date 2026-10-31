import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualCashFiscalHttpHandler } from '../../api/_lib/siisolutions-manual-http.js';
import { requestCashBoletaForCompletedSale } from '../../src/services/siisolutionsFiscalBridge.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('TPV bridge and HTTP handler agree on authenticated sale references', async () => {
  let invoked = 0;
  const handler = createManualCashFiscalHttpHandler({
    authenticate: async token => {
      assert.equal(token, 'trusted-session');
      return actorId;
    },
    issueManualCash: async args => {
      invoked++;
      assert.deepEqual(args, { actorId, businessId, invoiceId });
      return { state: 'issued', folio: 123, reason: null };
    },
  });
  const result = await requestCashBoletaForCompletedSale({
    businessId, invoiceId, accessToken: 'trusted-session',
    fetchImpl: async (_url, options) => {
      const res = response();
      await handler({
        method: options.method,
        headers: { authorization: options.headers.Authorization },
        body: JSON.parse(options.body),
      }, res);
      return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => res.body };
    },
  });
  assert.equal(invoked, 1);
  assert.deepEqual(result, { state: 'issued', folio: 123, reason: null });
});

test('HTTP handler refuses forged client identity and unauthorized sessions', async () => {
  let invoked = 0;
  const handler = createManualCashFiscalHttpHandler({
    authenticate: async () => { throw new Error('invalid token'); },
    issueManualCash: async () => { invoked++; return { state: 'issued' }; },
  });
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer invalid-session' },
    body: { businessId, invoiceId, actorId },
  }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(invoked, 0);
});

test('duplicate fiscal claim stays non-retryable across both layers', async () => {
  let invoked = 0;
  const handler = createManualCashFiscalHttpHandler({
    authenticate: async () => actorId,
    issueManualCash: async () => { invoked++; return { state: 'already_claimed' }; },
  });
  const result = await requestCashBoletaForCompletedSale({
    businessId, invoiceId, accessToken: 'trusted-session',
    fetchImpl: async (_url, options) => {
      const res = response();
      await handler({ method: 'POST', headers: { authorization: options.headers.Authorization }, body: JSON.parse(options.body) }, res);
      return { ok: false, status: res.statusCode, json: async () => res.body };
    },
  });
  assert.equal(invoked, 1);
  assert.deepEqual(result, { state: 'already_claimed', reason: 'RECONCILIATION_REQUIRED' });
});
