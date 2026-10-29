import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPointFiscalSaleLoader } from '../../api/_lib/siisolutions-point-sale-loader.js';

function adminStub({ operations = [{ id: 'op-1' }], invoice = { id: 'sale-1', business_id: 'biz-1' } } = {}) {
  const calls = [];
  const rows = {
    crm_invoices: invoice,
    crm_invoice_items: [{ name: 'Product' }],
    crm_payments: [{ amount: 1000 }],
    crm_pos_point_operations: operations,
  };
  return {
    calls,
    from(table) {
      const filters = [];
      const q = {
        eq(key, value) { filters.push([key, value]); return q; },
        limit(value) { filters.push(['limit', value]); return Promise.resolve({ data: rows[table], error: null }); },
        maybeSingle() { calls.push({ table, filters }); return Promise.resolve({ data: rows[table], error: null }); },
        then(resolve, reject) { calls.push({ table, filters }); return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject); },
      };
      return { select() { return q; } };
    },
  };
}

test('Point fiscal loader reads persisted invoice, payments, items and operation', async () => {
  const admin = adminStub();
  const result = await createPointFiscalSaleLoader(admin)({ invoiceId: 'sale-1', businessId: 'biz-1' });
  assert.equal(result.invoice.id, 'sale-1');
  assert.equal(result.operation.id, 'op-1');
  assert.deepEqual(admin.calls[0].filters, [['id', 'sale-1'], ['business_id', 'biz-1']]);
});

test('ambiguous Point operations never select an arbitrary payment', async () => {
  const admin = adminStub({ operations: [{ id: 'op-1' }, { id: 'op-2' }] });
  const result = await createPointFiscalSaleLoader(admin)({ invoiceId: 'sale-1', businessId: 'biz-1' });
  assert.equal(result.operation, null);
});
