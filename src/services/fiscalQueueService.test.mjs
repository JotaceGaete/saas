import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEmitFromQueue, emitPendingFromQueue, fetchFiscalQueue } from './fiscalQueueService.js';

const B = '0b6e2f1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const S = '1c7f3e2b-4d5e-4f60-9b0c-1d2e3f4a5b6c';
const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });

test('only pending rows are emittable from the panel', () => {
  for (const s of ['sending', 'unknown', 'issued', 'failed', 'cancelled']) assert.equal(canEmitFromQueue(s), false, s);
  assert.equal(canEmitFromQueue('pending'), true);
});

test('server 5xx on emit is reported as unknown and is never retried by the client', async () => {
  let calls = 0;
  const result = await emitPendingFromQueue({
    businessId: B, invoiceId: S, accessToken: 't',
    fetchImpl: async () => { calls++; return { ok: false, status: 503, json: async () => ({ error: 'ISSUANCE_OUTCOME_REQUIRES_REVIEW' }) }; },
  });
  assert.equal(result.state, 'unknown');
  assert.equal(calls, 1);
});

test('network failure on emit is reported as unknown without retry', async () => {
  let calls = 0;
  await assert.rejects(emitPendingFromQueue({
    businessId: B, invoiceId: S, accessToken: 't',
    fetchImpl: async () => { calls++; throw new Error('offline'); },
  }));
  assert.equal(calls, 1);
});

test('409 is shown as blocked and never reported as issued', async () => {
  const result = await emitPendingFromQueue({
    businessId: B, invoiceId: S, accessToken: 't',
    fetchImpl: reply(409, { state: 'not_pending', status: 'unknown' }),
  });
  assert.notEqual(result.state, 'issued');
});

test('fetch sends the session token and never includes payloads', async () => {
  let seen = null;
  const result = await fetchFiscalQueue({
    businessId: B, accessToken: 'tok',
    fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ items: [{ saleId: S, status: 'pending' }], counts: { pending: 1 } }) }; },
  });
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.match(seen.url, /businessId=0b6e2f1a/);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
});

test('403 from the server surfaces as a failed load, not an empty queue', async () => {
  const result = await fetchFiscalQueue({ businessId: B, accessToken: 't', fetchImpl: reply(403, { error: 'BUSINESS_NOT_AUTHORIZED' }) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});
