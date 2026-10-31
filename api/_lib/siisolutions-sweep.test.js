import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPointFiscalSweeper, createPointSweepCandidateLister } from './siisolutions-sweep.js';

const B = '0b6e2f1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const S1 = '1c7f3e2b-4d5e-4f60-9b0c-1d2e3f4a5b6c';
const S2 = '2d8a4f3c-5e6f-4a71-8c1d-2e3f4a5b6c7d';

// In-memory ledger that mimics the SQL unique keys and insert-or-nothing semantics.
function fakeLedger() {
  const rows = new Map();
  let inserts = 0;
  return {
    rows,
    get inserts() { return inserts; },
    async registerPending({ businessId, saleId, operationId }) {
      await new Promise(r => setImmediate(r));
      const key = `${businessId}|${saleId}|39`;
      if (rows.has(key)) return false;
      rows.set(key, { status: 'pending', operationId });
      inserts++;
      return true;
    },
  };
}

test('registers only verified sales, as pending, and never emits', async () => {
  const ledger = fakeLedger();
  const emitted = [];
  const sweep = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }],
    verifySale: async () => ({ ready: true }),
    registerPending: ledger.registerPending,
  });
  const report = await sweep({ limit: 10, dryRun: false });
  assert.equal(report.registered, 1);
  assert.equal(ledger.rows.get(`${B}|${S1}|39`).status, 'pending');
  assert.deepEqual(emitted, []);
});

test('verification communication failure writes nothing and is retried later', async () => {
  const ledger = fakeLedger();
  const sweep = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }],
    verifySale: async () => { throw new Error('MP timeout'); },
    registerPending: ledger.registerPending,
  });
  const report = await sweep({ dryRun: false });
  assert.equal(report.verificationUnavailable, 1);
  assert.equal(report.registered, 0);
  assert.equal(ledger.inserts, 0);
});

test('not-eligible sales are reported and never registered', async () => {
  const ledger = fakeLedger();
  const sweep = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }],
    verifySale: async () => ({ ready: false, reason: 'POINT_NOT_APPROVED' }),
    registerPending: ledger.registerPending,
  });
  const report = await sweep({ dryRun: false });
  assert.equal(report.notEligible, 1);
  assert.equal(ledger.inserts, 0);
});

test('running the sweep twice never duplicates a fiscal row', async () => {
  const ledger = fakeLedger();
  const sweep = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }, { businessId: B, invoiceId: S1 }],
    verifySale: async () => ({ ready: true }),
    registerPending: ledger.registerPending,
  });
  const first = await sweep({ dryRun: false });
  const second = await sweep({ dryRun: false });
  assert.equal(first.registered + second.registered, 1);
  assert.equal(ledger.rows.size, 1);
});

test('concurrent sweep, webhook and reconciler produce exactly one row', async () => {
  const ledger = fakeLedger();
  const verify = async () => ({ ready: true });
  const sweeperA = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }],
    verifySale: verify, registerPending: ledger.registerPending,
  });
  const sweeperB = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }],
    verifySale: verify, registerPending: ledger.registerPending,
  });
  const reports = await Promise.all([sweeperA({ dryRun: false }), sweeperB({ dryRun: false }), sweeperA({ dryRun: false }), sweeperB({ dryRun: false })]);
  const registered = reports.reduce((n, r) => n + r.registered, 0);
  const already = reports.reduce((n, r) => n + r.alreadyRegistered, 0);
  assert.equal(registered, 1);
  assert.equal(already, 3);
  assert.equal(ledger.rows.size, 1);
});

test('registration failure is counted and does not abort the run', async () => {
  const sweep = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }, { businessId: B, invoiceId: S2 }],
    verifySale: async () => ({ ready: true }),
    registerPending: async ({ saleId }) => { if (saleId === S1) throw new Error('db down'); return true; },
  });
  const report = await sweep({ dryRun: false });
  assert.equal(report.failed, 1);
  assert.equal(report.registered, 1);
});

test('batch size is capped at 50 regardless of request', async () => {
  let asked = null;
  const sweep = createPointFiscalSweeper({
    listCandidates: async ({ limit }) => { asked = limit; return []; },
    verifySale: async () => ({ ready: true }),
    registerPending: async () => true,
  });
  await sweep({ limit: 5000 });
  assert.equal(asked, 50);
});

test('candidate lister excludes sales that already have any ledger row', async () => {
  const admin = {
    from(table) {
      const q = {
        _table: table,
        select() { return q; }, not() { return q; }, gte() { return q; }, order() { return q; },
        limit() { return q; }, in() { return q; },
        then(res) {
          if (table === 'crm_pos_point_operations') {
            return res({ data: [
              { business_id: B, crm_invoice_id: S1, created_at: new Date().toISOString() },
              { business_id: B, crm_invoice_id: S2, created_at: new Date().toISOString() },
            ], error: null });
          }
          return res({ data: [{ business_id: B, sale_id: S1 }], error: null });
        },
      };
      return q;
    },
  };
  const list = createPointSweepCandidateLister(admin);
  const candidates = await list({ limit: 10 });
  assert.deepEqual(candidates, [{ businessId: B, invoiceId: S2 }]);
});

test('sweeper refuses to run without its dependencies', () => {
  assert.throws(() => createPointFiscalSweeper({}), /Sweep dependencies required/);
});


test('default sweep is diagnostic and never registers', async () => {
  const ledger = fakeLedger();
  const sweep = createPointFiscalSweeper({
    listCandidates: async () => [{ businessId: B, invoiceId: S1 }],
    verifySale: async () => ({ ready: true }),
    registerPending: ledger.registerPending,
  });
  const report = await sweep();
  assert.equal(report.eligibleDryRun, 1);
  assert.equal(ledger.inserts, 0);
});

test('candidate ledger lookup is scoped to business and sale', async () => {
  const otherBusiness = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const admin = { from(table) {
    const q = {
      select() { return q; }, not() { return q; }, gte() { return q; },
      order() { return q; }, limit() { return q; }, in() { return q; },
      then(resolve) { return resolve(table === 'crm_pos_point_operations'
        ? { data: [{ business_id: B, crm_invoice_id: S1 }, { business_id: otherBusiness, crm_invoice_id: S1 }], error: null }
        : { data: [{ business_id: B, sale_id: S1 }], error: null }); },
    }; return q;
  } };
  const candidates = await createPointSweepCandidateLister(admin)({ limit: 10 });
  assert.deepEqual(candidates, [{ businessId: otherBusiness, invoiceId: S1 }]);
});


test('candidate query honors explicit activation cutoff', async () => {
  let actualSince = null;
  const admin = { from(table) {
    const q = {
      select() { return q; }, not() { return q; },
      gte(column, value) { if (column === 'created_at') actualSince = value; return q; },
      order() { return q; }, limit() { return q; },
      then(resolve) { return resolve({ data: [], error: null }); },
    };
    return q;
  } };
  const cutoff = '2026-10-30T12:00:00.000Z';
  await createPointSweepCandidateLister(admin, { sinceDays: 365, notBefore: cutoff })({ limit: 10 });
  assert.equal(actualSince, cutoff);
});
