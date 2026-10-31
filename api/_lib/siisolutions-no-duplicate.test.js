import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { issueCheckoutBoleta } from './siisolutions-checkout-issuer.js';

const B = '0b6e2f1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const S = '2d8a4f3c-5e6f-4a71-8c1d-2e3f4a5b6c7d';
const SANDBOX = 'https://sandbox.example.test';
const ORIGINAL_ENV = process.env.SIISOLUTIONS_EMISSION_ENABLED;
afterEach(() => { process.env.SIISOLUTIONS_EMISSION_ENABLED = ORIGINAL_ENV; });

const sale = { id: S, business_id: B, status: 'pagada', total: 1190, items: [{ description: 'Café', unitPrice: 1190, quantity: 1, subtotal: 1190 }] };
const payment = { business_id: B, sale_id: S, method: 'cash', amount: 1190, currency: 'CLP', status: 'received', received_by_cashier: true };

function spyFetch(response = { status: 200, body: { folio: 1, xmlBase64: 'x', pdfBase64: 'p' } }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { status: response.status, ok: response.status < 300, json: async () => response.body };
  };
  return { calls, fetchImpl };
}
const run = (repository, fetchImpl) => issueCheckoutBoleta({
  sale, payment, businessId: B, issuerBusinessId: B, operatorRut: '12345678-5',
  apiKey: 'k', repository, sandboxBaseUrl: SANDBOX, fetchImpl,
});

test('an existing fiscal row (any state) blocks emission: provider is never called', async () => {
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  for (const existing of ['pending', 'sending', 'unknown', 'issued', 'failed']) {
    const spy = spyFetch();
    const repository = {
      // claim() is the only gate: it returns false whenever a row exists and is not promotable.
      claimPending: async () => existing === 'pending',
      finalize: async () => true,
    };
    const result = await run(repository, spy.fetchImpl);
    if (existing === 'pending') continue; // promotable row: emission is allowed by design
    assert.equal(result.state, 'already_claimed', existing);
    assert.equal(spy.calls.length, 0, `provider called while ${existing}`);
  }
});

test('a failed finalize after provider acceptance is not retried by a later attempt', async () => {
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  const spy = spyFetch();
  let claimed = false;
  const repository = {
    claimPending: async () => { if (claimed) return false; claimed = true; return true; },
    finalize: async () => { throw new Error('db down'); },
  };
  await assert.rejects(run(repository, spy.fetchImpl));
  // Subsequent attempt (webhook retry, reconciler, panel): the row is 'sending', so no new POST.
  const again = await run(repository, spy.fetchImpl);
  assert.equal(again.state, 'already_claimed');
  assert.equal(spy.calls.length, 1, 'provider must receive exactly one request');
});

test('a 409 from the provider (possible prior document) is stored as unknown and never re-sent', async () => {
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  const spy = spyFetch({ status: 409, body: { folioExistente: 77 } });
  const finalized = [];
  let claimed = false;
  const repository = {
    claimPending: async () => { if (claimed) return false; claimed = true; return true; },
    finalize: async (args) => { finalized.push(args); return true; },
  };
  const first = await run(repository, spy.fetchImpl);
  assert.equal(first.state, 'unknown');
  assert.equal(finalized[0].state, 'unknown');
  const second = await run(repository, spy.fetchImpl);
  assert.equal(second.state, 'already_claimed');
  assert.equal(spy.calls.length, 1);
});

test('network failure after send is unknown and is not retried', async () => {
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  let posts = 0;
  const fetchImpl = async () => { posts++; throw new Error('socket hang up'); };
  let claimed = false;
  const finalized = [];
  const repository = {
    claimPending: async () => { if (claimed) return false; claimed = true; return true; },
    finalize: async (args) => { finalized.push(args); return true; },
  };
  const result = await run(repository, fetchImpl);
  assert.equal(result.state, 'unknown');
  assert.equal(finalized[0].state, 'unknown');
  await run(repository, fetchImpl);
  assert.equal(posts, 1);
});

test('production URL and disabled simulation gate block before any claim or request', async () => {
  let claims = 0;
  const repository = { claimPending: async () => { claims++; return true; }, finalize: async () => true };
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'production';
  const spy = spyFetch();
  assert.equal((await run(repository, spy.fetchImpl)).state, 'blocked');
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  const prod = await issueCheckoutBoleta({
    sale, payment, businessId: B, issuerBusinessId: B, operatorRut: '12345678-5',
    apiKey: 'k', repository, sandboxBaseUrl: 'https://api.siisolutions.cl', fetchImpl: spy.fetchImpl,
  });
  assert.equal(prod.state, 'blocked');
  assert.equal(claims, 0);
  assert.equal(spy.calls.length, 0);
});
