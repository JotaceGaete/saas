import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSelectSql } from './sqlSelect.js';

test('SQL parametrizado con filtros, orden y límite', () => {
  const q = buildSelectSql({
    table: 'wa_products',
    columns: ['id', 'name'],
    eq: { business_id: 'b1', is_active: true },
    order: [{ column: 'sort_order', ascending: false }],
    limit: 5.9,
  });
  assert.equal(q.text, 'select "id", "name" from "wa_products" where "business_id" = $1 and "is_active" = $2 order by "sort_order" desc limit $3');
  assert.deepEqual(q.values, ['b1', true, 5]);
});

test('rechaza identificadores no válidos y valores nulos', () => {
  assert.throws(() => buildSelectSql({ table: 'x; drop table y', columns: ['id'] }));
  assert.throws(() => buildSelectSql({ table: 't', columns: ['id"--'] }));
  assert.throws(() => buildSelectSql({ table: 't', columns: ['id'], eq: { a: null } }));
  assert.throws(() => buildSelectSql({ table: 't', columns: [] }));
});
