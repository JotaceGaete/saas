import test from 'node:test';
import assert from 'node:assert/strict';
import { requestCashBoletaForCompletedSale } from '../../src/services/siisolutionsFiscalBridge.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';

test('rejects missing authentication without contacting server', async () => {
  const result = await requestCashBoletaForCompletedSale({
    businessId, invoiceId, fetchImpl: () => { throw Error('must not fetch'); },
  });
  assert.equal(result.reason, 'SESSION_REQUIRED');
});

test('sends only server-trusted references and bearer token', async () => {
  let calls = 0;
  const result = await requestCashBoletaForCompletedSale({
    businessId, invoiceId, accessToken: 'session',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, '/api/siisolutions-manual-cash');
      assert.equal(options.headers.Authorization, 'Bearer session');
      assert.deepEqual(JSON.parse(options.body), { businessId, invoiceId });
      return { ok: true, json: async () => ({ state: 'already_claimed' }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.state, 'already_claimed');
});

test('never retries an ambiguous network failure', async () => {
  let calls = 0;
  const result = await requestCashBoletaForCompletedSale({
    businessId, invoiceId, accessToken: 'session',
    fetchImpl: async () => { calls++; throw Error('timeout'); },
  });
  assert.equal(calls, 1);
  assert.equal(result.state, 'unknown');
});
