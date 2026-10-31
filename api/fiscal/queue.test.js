import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueueHandler } from './queue.js';

const B = '0b6e2f1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const S = '1c7f3e2b-4d5e-4f60-9b0c-1d2e3f4a5b6c';
const ACTOR = '9f1e2d3c-4b5a-4968-8777-665544332211';

function fakeRes() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function fakeAdmin({ ledger = [], invoices = [] } = {}) {
  return {
    from(table) {
      const q = {
        select() { return q; }, eq() { return q; }, in() { return q; },
        order() { return q; }, limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: ledger[0] || null, error: null }); },
        then(res) {
          if (table === 'crm_fiscal_issuances') return res({ data: ledger, error: null });
          if (table === 'crm_invoices') return res({ data: invoices, error: null });
          return res({ data: [], error: null });
        },
      };
      return q;
    },
  };
}
const owner = async ({ bearer, businessId }) => (bearer === 'Bearer good' && businessId === B)
  ? { ok: true, actorId: ACTOR }
  : { ok: false, status: bearer ? 403 : 401, error: bearer ? 'BUSINESS_NOT_AUTHORIZED' : 'UNAUTHORIZED' };

test('GET requires a session and business ownership', async () => {
  const handle = createQueueHandler({ admin: fakeAdmin(), assertOwner: owner, emitPending: async () => ({}) });
  let res = fakeRes();
  await handle({ method: 'GET', headers: {}, query: { businessId: B } }, res);
  assert.equal(res.statusCode, 401);
  res = fakeRes();
  await handle({ method: 'GET', headers: { authorization: 'Bearer other' }, query: { businessId: B } }, res);
  assert.equal(res.statusCode, 403);
});

test('GET never returns XML/PDF payloads or credentials', async () => {
  const ledger = [{ sale_id: S, status: 'issued', folio: 7, error_code: null, created_at: 'x', updated_at: 'y', xml_base64: 'SECRETXML', pdf_base64: 'SECRETPDF', api_key: 'k' }];
  const handle = createQueueHandler({ admin: fakeAdmin({ ledger, invoices: [{ id: S, total: 1190 }] }), assertOwner: owner, emitPending: async () => ({}) });
  const res = fakeRes();
  await handle({ method: 'GET', headers: { authorization: 'Bearer good' }, query: { businessId: B } }, res);
  assert.equal(res.statusCode, 200);
  const serialized = JSON.stringify(res.body);
  assert.doesNotMatch(serialized, /SECRET|xml|pdf|api_key/i);
  assert.equal(res.body.items[0].folio, 7);
  assert.equal(res.body.items[0].total, 1190);
  assert.deepEqual(res.body.counts, { issued: 1 });
});

test('POST only emits PENDING rows; unknown, sending, issued and failed are refused', async () => {
  for (const status of ['unknown', 'sending', 'issued', 'failed', 'cancelled']) {
    let emitted = false;
    const handle = createQueueHandler({
      admin: fakeAdmin({ ledger: [{ status }] }), assertOwner: owner,
      emitPending: async () => { emitted = true; return { state: 'issued' }; },
    });
    const res = fakeRes();
    await handle({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { businessId: B, invoiceId: S } }, res);
    assert.equal(res.statusCode, 409, status);
    assert.equal(emitted, false, status);
  }
});

test('POST pending emits through the guarded path with the verified actor', async () => {
  let args = null;
  const handle = createQueueHandler({
    admin: fakeAdmin({ ledger: [{ status: 'pending' }] }), assertOwner: owner,
    emitPending: async (a) => { args = a; return { state: 'issued', folio: 11 }; },
  });
  const res = fakeRes();
  await handle({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { businessId: B, invoiceId: S, actorId: 'spoofed' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.folio, 11);
  assert.equal(args.actorId, ACTOR);
  assert.equal(args.businessId, B);
});

test('POST without a queued row returns 404 and never emits', async () => {
  let emitted = false;
  const handle = createQueueHandler({ admin: fakeAdmin({ ledger: [] }), assertOwner: owner, emitPending: async () => { emitted = true; return {}; } });
  const res = fakeRes();
  await handle({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { businessId: B, invoiceId: S } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(emitted, false);
});

test('emitter exception surfaces as review-required without retry', async () => {
  let attempts = 0;
  const handle = createQueueHandler({
    admin: fakeAdmin({ ledger: [{ status: 'pending' }] }), assertOwner: owner,
    emitPending: async () => { attempts++; throw new Error('network'); },
  });
  const res = fakeRes();
  await handle({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { businessId: B, invoiceId: S } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(attempts, 1);
});

test('unsupported methods are rejected', async () => {
  const handle = createQueueHandler({ admin: fakeAdmin(), assertOwner: owner, emitPending: async () => ({}) });
  const res = fakeRes();
  await handle({ method: 'DELETE', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
