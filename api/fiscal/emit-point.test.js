import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPointEmissionHandler, secretsMatch } from './emit-point.js';

const BIZ = '0b6e2f1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const INV = '1c7f3e2b-4d5e-4f60-9b0c-1d2e3f4a5b6c';
const SECRET = 'a-long-internal-secret-value-for-tests';

function fakeRes() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (over = {}) => ({
  method: 'POST',
  headers: { 'x-fiscal-internal-secret': SECRET },
  body: { businessId: BIZ, invoiceId: INV },
  ...over,
});

test('rejects non-POST and sets Allow header', async () => {
  const res = fakeRes();
  await createPointEmissionHandler({ internalSecret: SECRET, issuePointSale: async () => ({}) })(req({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

test('fails closed when the internal secret is not configured', async () => {
  const res = fakeRes();
  await createPointEmissionHandler({ internalSecret: '', issuePointSale: async () => ({}) })(req(), res);
  assert.equal(res.statusCode, 503);
});

test('rejects missing or wrong secret without calling the issuer', async () => {
  let called = false;
  const handle = createPointEmissionHandler({ internalSecret: SECRET, issuePointSale: async () => { called = true; return {}; } });
  for (const headers of [{}, { 'x-fiscal-internal-secret': 'wrong' }]) {
    const res = fakeRes();
    await handle(req({ headers }), res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(called, false);
});

test('rejects malformed identifiers before any fiscal work', async () => {
  let called = false;
  const res = fakeRes();
  await createPointEmissionHandler({ internalSecret: SECRET, issuePointSale: async () => { called = true; return {}; } })(
    req({ body: { businessId: 'not-a-uuid', invoiceId: INV } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test('maps blocked and already-claimed outcomes without leaking details', async () => {
  const blocked = fakeRes();
  await createPointEmissionHandler({ internalSecret: SECRET, issuePointSale: async () => ({ state: 'blocked', reason: 'POINT_NOT_APPROVED' }) })(req(), blocked);
  assert.equal(blocked.statusCode, 403);
  assert.deepEqual(blocked.body, { state: 'blocked', reason: 'POINT_NOT_APPROVED' });

  const claimed = fakeRes();
  await createPointEmissionHandler({ internalSecret: SECRET, issuePointSale: async () => ({ state: 'already_claimed' }) })(req(), claimed);
  assert.equal(claimed.statusCode, 409);
});

test('issuer exception returns review-required and is never retried', async () => {
  let attempts = 0;
  const res = fakeRes();
  await createPointEmissionHandler({ internalSecret: SECRET, issuePointSale: async () => { attempts++; throw new Error('boom'); } })(req(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'ISSUANCE_OUTCOME_REQUIRES_REVIEW');
  assert.equal(attempts, 1);
});

test('successful issuance returns state and folio only', async () => {
  const res = fakeRes();
  await createPointEmissionHandler({ internalSecret: SECRET, issuePointSale: async () => ({ state: 'issued', folio: 42, operationId: 'x', xmlBase64: 'secret' }) })(req(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { state: 'issued', folio: 42, reason: null });
});

test('secretsMatch is strict about type and value', () => {
  assert.equal(secretsMatch(SECRET, SECRET), true);
  assert.equal(secretsMatch(SECRET + 'x', SECRET), false);
  assert.equal(secretsMatch(undefined, SECRET), false);
  assert.equal(secretsMatch(SECRET, ''), false);
});
